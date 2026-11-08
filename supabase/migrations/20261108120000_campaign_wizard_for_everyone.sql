-- The campaign wizard is part of the product for every client, not a pilot. clients.wizard_enabled
-- stays as an admin-only off-switch for a client who should not have it.
--
-- Apply when the campaign wizard is merged to main, not before: the switch also skips the staff
-- review for campaigns a client creates by hand (auto_approve_client_campaign), and today's
-- production app does not show the wizard yet. After applying, rename this file to the version
-- the database records (supabase/migrations/README.md).

alter table public.clients alter column wizard_enabled set default true;

-- The admin-fields guard keeps the old value unless an admin is signed in; this one-off system
-- update switches it off for the update only.
alter table public.clients disable trigger trg_protect_client_admin_fields;
update public.clients set wizard_enabled = true where not wizard_enabled;
alter table public.clients enable trigger trg_protect_client_admin_fields;

comment on column public.clients.wizard_enabled is
  'Campaign wizard on for this client (default true). Admin-only. Also skips the staff review of campaigns the client creates by hand.';
