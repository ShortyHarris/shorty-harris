-- A sandbox client is a real client in every respect: it connects its own Gmail
-- and sends through the real path, so the sandbox exercises the MIME, the
-- subject encoding and the inbox reply search, which is exactly where the two
-- faults found on 4 November lived. A sandbox that stubbed sending would not
-- have touched them.
--
-- Safety is therefore not "block sending", it is "there is nothing real to
-- send to": every sandbox prospect address must be derived from the tester's
-- own connected mailbox, so the mail can only ever reach the tester.
alter table public.clients
  add column if not exists is_sandbox boolean not null default false;

comment on column public.clients.is_sandbox is
  'Test account. Prospect addresses must derive from its own connected mailbox, '
  'Twilio is held, discovery is refused, and it is excluded from health monitors.';

-- A client cannot promote itself into (or out of) sandbox: same protection the
-- other privileged columns already have.
create or replace function public.protect_client_admin_fields()
returns trigger
language plpgsql
as $function$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.monthly_prospect_limit := old.monthly_prospect_limit;
    new.max_campaigns := old.max_campaigns;
    new.auto_approve_campaigns := old.auto_approve_campaigns;
    new.allow_generic_mailboxes := old.allow_generic_mailboxes;
    new.is_internal := old.is_internal;
    new.is_sandbox := old.is_sandbox;
  end if;
  return new;
end;
$function$;

-- True when the address is safe for this client. Non-sandbox clients are
-- unaffected. For a sandbox client the address must be its connected mailbox,
-- or that mailbox plus-addressed: martin@tutel.cz allows martin+sbx-01@tutel.cz.
create or replace function public.sandbox_address_allowed(p_client_id uuid, p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sandbox boolean;
  v_mailbox text;
  v_local text;
  v_domain text;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select is_sandbox into v_sandbox from clients where id = p_client_id;
  if coalesce(v_sandbox, false) = false then
    return true;
  end if;

  select lower(email_address) into v_mailbox
  from client_email_credentials
  where client_id = p_client_id and status = 'active'
  limit 1;

  -- No mailbox connected yet means nothing may be addressed at all. Failing
  -- closed is the whole point: an unconfigured sandbox must not be able to mail
  -- anyone, rather than falling back to allowing everything.
  if v_mailbox is null or v_email = '' then
    return false;
  end if;

  v_local  := split_part(v_mailbox, '@', 1);
  v_domain := split_part(v_mailbox, '@', 2);
  return v_email = v_mailbox
      or v_email like (v_local || '+%@' || v_domain);
end;
$$;

-- Enforced at the point a prospect is created or its address changed, so a
-- hand-run CSV import into a sandbox client is refused rather than discovered
-- later in someone's inbox.
create or replace function public.enforce_sandbox_prospect_address()
returns trigger
language plpgsql
as $$
begin
  if not public.sandbox_address_allowed(new.client_id, new.email) then
    raise exception
      'Sandbox client %: prospect address % is not derived from its connected mailbox. '
      'Sandbox prospects may only use that mailbox plus-addressed, for example you+sbx-01@yourdomain.',
      new.client_id, new.email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_sandbox_prospect_address on public.prospects;
create trigger trg_enforce_sandbox_prospect_address
  before insert or update of email, client_id on public.prospects
  for each row execute function public.enforce_sandbox_prospect_address();

-- Discovery costs real money per run, and a sandbox never needs it: the reset
-- seeds its prospects directly.
create or replace function public.refuse_sandbox_discovery()
returns trigger
language plpgsql
as $$
declare v_sandbox boolean;
begin
  select cl.is_sandbox into v_sandbox
  from campaigns c join clients cl on cl.id = c.client_id
  where c.id = new.campaign_id;
  if coalesce(v_sandbox, false) then
    raise exception 'Sandbox clients do not run discovery. Use Reset to seed prospects.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refuse_sandbox_discovery on public.discovery_queue;
create trigger trg_refuse_sandbox_discovery
  before insert on public.discovery_queue
  for each row execute function public.refuse_sandbox_discovery();

-- Twilio is held rather than skipped: the row is still written, so a tester can
-- see the notification was built correctly, but WF14 only drains 'pending' so
-- nothing dials out.
create or replace function public.hold_sandbox_notification()
returns trigger
language plpgsql
as $$
declare v_sandbox boolean;
begin
  select is_sandbox into v_sandbox from clients where id = new.client_id;
  if coalesce(v_sandbox, false) and new.status = 'pending' then
    new.status := 'sandbox_held';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hold_sandbox_notification on public.notifications;
create trigger trg_hold_sandbox_notification
  before insert on public.notifications
  for each row execute function public.hold_sandbox_notification();

-- Sandbox traffic must not trip the silent-failure detector added earlier today.
create or replace function public.check_reply_health()
returns table (client_id uuid, sent_14d bigint, replies_14d bigint, flagged boolean)
language sql
security definer
set search_path to 'public'
as $$
  with per_client as (
    select m.client_id,
           count(*) filter (where m.send_status = 'sent'
                              and m.sent_at > now() - interval '14 days') as sent_14d,
           (select count(*) from replies r
             where r.client_id = m.client_id
               and r.received_at > now() - interval '14 days') as replies_14d
    from messages m
    join clients cl on cl.id = m.client_id and coalesce(cl.is_sandbox, false) = false
    group by m.client_id
  )
  select client_id, sent_14d, replies_14d,
         (sent_14d >= 30 and replies_14d = 0) as flagged
  from per_client;
$$;

revoke all on function public.sandbox_address_allowed(uuid, text) from public, anon, authenticated;
revoke all on function public.check_reply_health() from public, anon, authenticated;;
