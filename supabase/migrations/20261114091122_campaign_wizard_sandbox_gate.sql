-- Campaign wizard rollout switch. One admin toggle decides who sees the wizard:
--   wizard_settings.sandbox_only = true   only sandbox accounts (clients.is_sandbox) get it
--   wizard_settings.sandbox_only = false  every client gets it
-- clients.wizard_enabled stays as the admin-only off-switch for one client.
--
-- wizard_on_for(client) is the one place that combines the two. The app, the wizard-ai edge
-- function and the auto-approve trigger all ask it, so the toggle takes effect everywhere at
-- once, with no deploy.
--
-- This replaces 20261108120000_campaign_wizard_for_everyone (never applied), which turned the
-- per-client switch on for everyone and so had to wait for the wizard to reach main. With the
-- gate in front of it that is safe at any time: while sandbox_only is on, real clients still
-- don't see the wizard, and their campaigns still go through staff review.

alter table public.wizard_settings
  add column if not exists sandbox_only boolean not null default true;

comment on column public.wizard_settings.sandbox_only is
  'Campaign wizard rollout. true: only sandbox accounts see it. false: every client (unless switched off for that client in clients.wizard_enabled). Admin-only.';

create or replace function public.wizard_on_for(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.wizard_enabled
       and (c.is_sandbox or not coalesce((select s.sandbox_only from public.wizard_settings s where s.id = 1), true))
    from public.clients c
    where c.id = p_client_id
      -- Only for your own account (or the one an admin is viewing as), as an admin, or from the
      -- backend (edge functions, n8n).
      and (public.is_admin()
           or c.id = public.current_client_id()
           or c.id = public.impersonating_client_id()
           or coalesce(auth.role(), '') = 'service_role'
           -- session_user, not current_user: inside this security definer function
           -- current_user is always its owner. This is direct SQL (dashboard, migrations).
           or session_user in ('postgres', 'supabase_admin'))
  ), false);
$$;

comment on function public.wizard_on_for(uuid) is
  'Whether the campaign wizard is on for this client: clients.wizard_enabled and (a sandbox account, or wizard_settings.sandbox_only is off).';

revoke all on function public.wizard_on_for(uuid) from public, anon;
grant execute on function public.wizard_on_for(uuid) to authenticated, service_role;

-- Campaigns a client creates skip staff review when the wizard is on for them, so this now
-- follows the rollout switch too: while it is sandbox-only, real clients' campaigns still wait
-- for review.
create or replace function public.auto_approve_client_campaign()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  should_auto_approve boolean;
begin
  if new.status = 'pending_review' then
    select auto_approve_campaigns or public.wizard_on_for(id) into should_auto_approve
    from public.clients
    where id = new.client_id;

    if should_auto_approve then
      perform set_config('app.bypass_campaign_protection', 'true', true); -- true = local to this transaction only
      update public.campaigns set status = 'active' where id = new.id;
      perform set_config('app.bypass_campaign_protection', 'false', true);
    end if;
  end if;
  return new;
end;
$function$;

-- The per-client switch is on by default and for everyone; the rollout switch above decides
-- who actually sees the wizard.
alter table public.clients alter column wizard_enabled set default true;

-- The admin-fields guard keeps the old value unless an admin is signed in; this one-off system
-- update switches it off for the update only.
alter table public.clients disable trigger trg_protect_client_admin_fields;
update public.clients set wizard_enabled = true where not wizard_enabled;
alter table public.clients enable trigger trg_protect_client_admin_fields;

comment on column public.clients.wizard_enabled is
  'Campaign wizard for this client (default true). Admin-only off-switch. Whether they actually see it also depends on wizard_settings.sandbox_only - see wizard_on_for().';
