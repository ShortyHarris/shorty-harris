alter table public.messages
  add column if not exists send_error text,
  add column if not exists send_attempts integer not null default 0,
  add column if not exists send_retry_at timestamptz;

create or replace function public.client_mailbox_ready(p_client_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.client_email_credentials e
                  where e.client_id = p_client_id and e.status = 'active');
$function$;
grant execute on function public.client_mailbox_ready(uuid) to authenticated, service_role;

do $mig$
declare d text := rtrim(pg_get_viewdef('public.sendable_messages'), E'; \n');
begin
  if position('client_mailbox_ready' in d) > 0 then raise exception 'already applied'; end if;
  execute 'create or replace view public.sendable_messages as ' || d
    || ' AND client_mailbox_ready(m.client_id)'
    || ' AND (m.send_retry_at IS NULL OR m.send_retry_at <= now())';
end $mig$;

do $mig$
declare d text := rtrim(pg_get_viewdef('public.message_block_reasons'), E'; \n');
  a text := 'ELSE ''waiting_followup_timing''::text';
begin
  if position(a in d) = 0 then raise exception 'message_block_reasons: anchor not found'; end if;
  d := replace(d, a,
    'WHEN (NOT client_mailbox_ready(m.client_id)) THEN ''no_gmail''::text '
    || 'WHEN (m.send_retry_at > now()) THEN ''retrying_send''::text ' || a);
  execute 'create or replace view public.message_block_reasons as ' || d;
end $mig$;

drop function if exists public.release_message_claim(uuid);
create or replace function public.release_message_claim(p_message_id uuid, p_error text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update messages m
     set send_claimed_at = null,
         send_error = coalesce(nullif(p_error, ''), 'send_failed'),
         send_attempts = m.send_attempts + case when public.client_mailbox_ready(m.client_id) then 1 else 0 end,
         send_status = case
           when m.send_attempts + case when public.client_mailbox_ready(m.client_id) then 1 else 0 end >= 3
             then 'failed' else 'not_sent' end,
         send_retry_at = now() + make_interval(mins => 15 * greatest(1, m.send_attempts + 1)),
         updated_at = now()
   where m.id = p_message_id
     and m.send_status <> 'sent'
     and m.send_claimed_at is not null;
$function$;
grant execute on function public.release_message_claim(uuid, text) to anon, authenticated, service_role;

do $mig$
declare d text := pg_get_functiondef('public.sandbox_next_step'::regproc);
  a text := '    perform public.sandbox_fire(''wf3-send-outreach'', jsonb_build_object(''message_id'', v_msg.id));';
begin
  if position(a in d) = 0 then raise exception 'sandbox_next_step: anchor not found'; end if;
  d := replace(d, a,
    '    if not public.client_mailbox_ready((select client_id from prospects where id = p_prospect_id)) then' || chr(10) ||
    '      return jsonb_build_object(''ok'', false, ''error'', ''no_gmail'',' || chr(10) ||
    '        ''detail'', ''Gmail is not connected. Connect it in Settings first; the email stays approved and will send once it is.'');' || chr(10) ||
    '    end if;' || chr(10) || a);
  execute d;
end $mig$;