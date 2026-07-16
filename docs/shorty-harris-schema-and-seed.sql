-- =====================================================================
-- SHORTY HARRIS MVP — FULL DATABASE SCRIPT
-- Schema (24 tables) + RLS + functions/triggers + seed data
--
-- Run this in the Supabase SQL Editor on a FRESH project.
-- Order matters; run top to bottom in one go.
--
-- Safe to re-run? No — it CREATEs objects. To reset first, see the
-- optional teardown block at the very bottom (commented out).
-- =====================================================================


-- =====================================================================
-- SECTION 1 — CORE IDENTITY & BILLING
-- =====================================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  business_type text,
  location text,
  contact_email text,
  contact_phone text,
  status text not null default 'active' check (status in ('draft','active','paused','churned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  full_name text,
  role text not null default 'client' check (role in ('admin','client')),
  phone text,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.billing_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  credits_remaining integer not null default 0,
  sms_credits_remaining integer not null default 0,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('purchase','hot_lead_deduction','sms_deduction','adjustment','refund')),
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  credits_purchased integer not null default 0,
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_client on public.profiles(client_id);
create index idx_credit_tx_client on public.credit_transactions(client_id);
create index idx_payments_client on public.payments(client_id);


-- =====================================================================
-- SECTION 2 — LEAD SOURCE LAYER
-- =====================================================================

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  channel text not null default 'email' check (channel in ('email','sms','whatsapp')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prospect_imports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  source text not null default 'csv' check (source in ('csv','google_sheets','apify','manual')),
  file_name text,
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  dnc_blocked_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  created_at timestamptz not null default now()
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  import_id uuid references public.prospect_imports(id) on delete set null,
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  category text,
  location text,
  website text,
  pipeline_status text not null default 'new' check (pipeline_status in ('new','contacted','replied','hot_lead','won','lost')),
  is_sandbox boolean not null default true,
  enrichment jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.do_not_contact (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  reason text not null default 'opt_out' check (reason in ('opt_out','stop_request','bounce','manual','legal')),
  source_prospect_id uuid references public.prospects(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dnc_email_or_phone check (email is not null or phone is not null)
);
create unique index idx_dnc_email on public.do_not_contact(lower(email)) where email is not null;
create unique index idx_dnc_phone on public.do_not_contact(phone) where phone is not null;

create index idx_prospects_campaign on public.prospects(campaign_id);
create index idx_prospects_client on public.prospects(client_id);
create index idx_prospects_status on public.prospects(pipeline_status);
create index idx_prospects_email on public.prospects(lower(email));
create index idx_campaigns_client on public.campaigns(client_id);


-- =====================================================================
-- SECTION 3 — OUTREACH PIPELINE
-- =====================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email','sms','whatsapp')),
  subject text,
  body text not null,
  message_type text not null default 'initial' check (message_type in ('initial','follow_up_d3','follow_up_d7','follow_up_d14')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','edited')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  send_status text not null default 'not_sent' check (send_status in ('not_sent','queued','scheduled','sent','failed','blocked_dnc')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-client Gmail OAuth, so each client sends outreach from their own address
-- (google-oauth-callback + gmail-client edge functions).
create table public.client_email_credentials (
  client_id uuid primary key references public.clients(id) on delete cascade,
  email_address text,
  status text not null default 'pending' check (status in ('active','revoked','error','pending')),
  error_message text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  body text not null,
  received_at timestamptz not null default now(),
  gmail_message_id text,
  intent text check (intent in ('interested','maybe','not_interested','stop','wrong_person','out_of_office')),
  intent_confidence numeric(4,3),
  classified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.follow_up_schedules (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  follow_up_day integer not null check (follow_up_day in (3,7,14)),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','generated','sent','cancelled','rescheduled')),
  rescheduled_to timestamptz,
  reschedule_reason text check (reschedule_reason in ('weekend','holiday','collision','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hot_leads (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null unique references public.prospects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  reply_id uuid references public.replies(id) on delete set null,
  ai_summary text,
  suggested_action text,
  status text not null default 'new' check (status in ('new','viewed','contacted','won','lost')),
  credit_deducted boolean not null default false,
  routed_at timestamptz not null default now(),
  status_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  hot_lead_id uuid references public.hot_leads(id) on delete set null,
  channel text not null default 'whatsapp' check (channel in ('sms','whatsapp','email','in_app')),
  body text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','sandbox_logged')),
  twilio_sid text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- Drives the client-side notification bell's unread badge/mark-as-read.
  -- null = unread.
  read_at timestamptz
);

create index idx_messages_prospect on public.messages(prospect_id);
create index idx_messages_client on public.messages(client_id);
create index idx_messages_approval on public.messages(approval_status) where approval_status = 'pending';
create index idx_messages_send on public.messages(send_status);
create index idx_replies_prospect on public.replies(prospect_id);
create index idx_replies_client on public.replies(client_id);
create index idx_fus_due on public.follow_up_schedules(status, due_at);
create index idx_hot_leads_client on public.hot_leads(client_id, status);
create index idx_notifications_client on public.notifications(client_id);


-- =====================================================================
-- SECTION 4 — A/B TESTING, COMPLIANCE, SCHEDULING
-- =====================================================================

create table public.ab_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  test_type text not null default 'message' check (test_type in ('message','channel','subject','pricing')),
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.ab_variants (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.ab_tests(id) on delete cascade,
  variant_key text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (test_id, variant_key)
);

create table public.ab_assignments (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.ab_tests(id) on delete cascade,
  variant_id uuid not null references public.ab_variants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (test_id, client_id, prospect_id)
);

create table public.ab_metrics (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.ab_tests(id) on delete cascade,
  variant_id uuid not null references public.ab_variants(id) on delete cascade,
  metric text not null check (metric in ('visit','conversion','reply','hot_lead','revenue_cents')),
  value numeric not null default 1,
  recorded_at timestamptz not null default now()
);

create table public.compliance_checks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  check_type text not null check (check_type in ('can_spam','gdpr','tcpa','dnc')),
  passed boolean not null,
  warnings jsonb default '[]'::jsonb,
  checked_at timestamptz not null default now()
);

create table public.prospect_collisions (
  id uuid primary key default gen_random_uuid(),
  prospect_email text,
  prospect_phone text,
  blocked_client_id uuid not null references public.clients(id) on delete cascade,
  winning_client_id uuid references public.clients(id) on delete set null,
  blocked_message_id uuid references public.messages(id) on delete set null,
  resolution text not null default 'rescheduled' check (resolution in ('rescheduled','skipped','manual_override')),
  rescheduled_days integer check (rescheduled_days in (3,7,14)),
  detected_at timestamptz not null default now()
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  country_code text not null default 'US',
  created_at timestamptz not null default now()
);

create index idx_ab_assign_test on public.ab_assignments(test_id);
create index idx_ab_metrics_variant on public.ab_metrics(test_id, variant_id, metric);
create index idx_collisions_email on public.prospect_collisions(prospect_email);


-- =====================================================================
-- SECTION 5 — MONITORING & AUDIT
-- =====================================================================

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('wf1_import','wf2_generation','wf2_5_approval','wf3_send','wf4_classification','wf5_follow_up','wf6_hot_lead','stripe_webhook','frontend','edge_function','other')),
  error_type text not null,
  message text not null,
  context jsonb default '{}'::jsonb,
  severity text not null default 'error' check (severity in ('warning','error','critical')),
  resolved boolean not null default false,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  retry_count integer not null default 0,
  is_dead_letter boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_type text not null default 'system' check (actor_type in ('admin','client','system','workflow')),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('gemini','gmail','stripe','twilio','apify')),
  endpoint text,
  status_code integer,
  duration_ms integer,
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_error_logs_unresolved on public.error_logs(resolved, created_at) where resolved = false;
create index idx_audit_logs_resource on public.audit_logs(resource_type, resource_id);
create index idx_audit_logs_actor on public.audit_logs(actor_id, created_at);
create index idx_api_logs_service on public.api_request_logs(service, created_at);


-- =====================================================================
-- SECTION 6 — FUNCTIONS & TRIGGERS
-- =====================================================================

-- audit_logs is append-only: block updates and deletes
create or replace function public.prevent_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end; $$;

create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function public.prevent_audit_mutation();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

-- helpers used by RLS policies
create or replace function public.current_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;


-- =====================================================================
-- SECTION 7 — ROW LEVEL SECURITY
-- =====================================================================

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.billing_profiles enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.payments enable row level security;
alter table public.campaigns enable row level security;
alter table public.prospect_imports enable row level security;
alter table public.prospects enable row level security;
alter table public.do_not_contact enable row level security;
alter table public.client_email_credentials enable row level security;
alter table public.messages enable row level security;
alter table public.replies enable row level security;
alter table public.follow_up_schedules enable row level security;
alter table public.hot_leads enable row level security;
alter table public.notifications enable row level security;
alter table public.ab_tests enable row level security;
alter table public.ab_variants enable row level security;
alter table public.ab_assignments enable row level security;
alter table public.ab_metrics enable row level security;
alter table public.compliance_checks enable row level security;
alter table public.prospect_collisions enable row level security;
alter table public.holidays enable row level security;
alter table public.error_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.api_request_logs enable row level security;

-- ADMIN: full access everywhere
create policy admin_all_clients on public.clients for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_profiles on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_billing on public.billing_profiles for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_credit_tx on public.credit_transactions for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_payments on public.payments for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_campaigns on public.campaigns for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_imports on public.prospect_imports for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_prospects on public.prospects for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_dnc on public.do_not_contact for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_email_credentials on public.client_email_credentials for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_messages on public.messages for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_replies on public.replies for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_fus on public.follow_up_schedules for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_hot_leads on public.hot_leads for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_notifications on public.notifications for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ab_tests on public.ab_tests for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ab_variants on public.ab_variants for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ab_assignments on public.ab_assignments for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ab_metrics on public.ab_metrics for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_compliance on public.compliance_checks for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_collisions on public.prospect_collisions for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_holidays on public.holidays for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_errors on public.error_logs for all using (public.is_admin()) with check (public.is_admin());
create policy admin_read_audit on public.audit_logs for select using (public.is_admin());
create policy admin_insert_audit on public.audit_logs for insert with check (public.is_admin());
create policy admin_all_api_logs on public.api_request_logs for all using (public.is_admin()) with check (public.is_admin());

-- CLIENT: read-only access scoped to their own client_id
create policy client_own_profile on public.profiles for select using (id = auth.uid());
create policy client_own_client on public.clients for select using (id = public.current_client_id());
create policy client_own_billing on public.billing_profiles for select using (client_id = public.current_client_id());
create policy client_own_credit_tx on public.credit_transactions for select using (client_id = public.current_client_id());
create policy client_own_payments on public.payments for select using (client_id = public.current_client_id());
create policy client_own_hot_leads_read on public.hot_leads for select using (client_id = public.current_client_id());
create policy client_own_hot_leads_update on public.hot_leads for update using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy client_own_replies on public.replies for select using (client_id = public.current_client_id());
create policy client_own_messages on public.messages for select using (client_id = public.current_client_id());
create policy client_own_messages_update on public.messages for update using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy client_own_email_credentials on public.client_email_credentials for select using (client_id = public.current_client_id());
create policy client_own_email_credentials_update on public.client_email_credentials for update using (client_id = public.current_client_id()) with check (client_id = public.current_client_id());
create policy client_own_notifications on public.notifications for select using (client_id = public.current_client_id());
create policy client_own_prospects on public.prospects for select using (client_id = public.current_client_id());


-- =====================================================================
-- SECTION 8 — SEED DATA (sandbox)
-- =====================================================================

-- Clients
insert into public.clients (id, business_name, business_type, location, contact_email, contact_phone, status) values
('11111111-1111-1111-1111-111111111111','Kabwata Laundry Co.','Laundry services','Lusaka, ZM','laundry@sandbox.test','+260970000001','active'),
('22222222-2222-2222-2222-222222222222','GreenClean Services','Commercial cleaning','Kafue, ZM','greenclean@sandbox.test','+260970000002','active'),
('33333333-3333-3333-3333-333333333333','Apex Fitness Supplies','Gym equipment','Austin, TX','apex@sandbox.test','+15125550199','active');

insert into public.billing_profiles (client_id, credits_remaining, sms_credits_remaining) values
('11111111-1111-1111-1111-111111111111', 14, 20),
('22222222-2222-2222-2222-222222222222', 32, 0),
('33333333-3333-3333-3333-333333333333', 5, 10);

insert into public.campaigns (id, client_id, name, status, channel) values
('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Lusaka hospitality outreach June','active','email'),
('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Kafue lodges and offices','active','email'),
('aaaaaaaa-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','Texas gyms Q3','draft','email');

insert into public.prospect_imports (id, campaign_id, source, file_name, total_rows, imported_count, duplicate_count, dnc_blocked_count, status) values
('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','csv','mock_apify_hotels.csv',50,48,1,1,'completed'),
('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','google_sheets','kafue_prospects',40,40,0,0,'completed'),
('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000003','csv','texas_gyms.csv',32,32,0,0,'completed');

-- 120 prospects, status derived from index (same generator used in the live DB)
insert into public.prospects (campaign_id, client_id, import_id, business_name, contact_name, email, phone, category, location, pipeline_status, is_sandbox)
select
  case when i <= 48 then 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
       when i <= 88 then 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
       else 'aaaaaaaa-0000-0000-0000-000000000003'::uuid end,
  case when i <= 48 then '11111111-1111-1111-1111-111111111111'::uuid
       when i <= 88 then '22222222-2222-2222-2222-222222222222'::uuid
       else '33333333-3333-3333-3333-333333333333'::uuid end,
  case when i <= 48 then 'bbbbbbbb-0000-0000-0000-000000000001'::uuid
       when i <= 88 then 'bbbbbbbb-0000-0000-0000-000000000002'::uuid
       else 'bbbbbbbb-0000-0000-0000-000000000003'::uuid end,
  (array['Continental Hotel','Mika Lodge','FitZone Gym','Chita Lodge','Sunrise Clinic','Blue Nile Restaurant','Protea Office Park','Twangale Resort','Eastpark Dental','Mulungushi Conference'])[1 + (i % 10)] || ' #' || lpad(i::text, 3, '0'),
  (array['Chanda M.','Brian K.','Natasha P.','David L.','Mary T.'])[1 + (i % 5)],
  'prospect' || i || '@sandbox.shortyharris.test',
  '+2609700' || lpad((10000 + i)::text, 5, '0'),
  (array['hospitality','fitness','healthcare','restaurant','office'])[1 + (i % 5)],
  case when i <= 88 then 'Lusaka, ZM' else 'Austin, TX' end,
  case
    when i % 10 in (0,1,2,3) then 'new'
    when i % 10 in (4,5) then 'contacted'
    when i % 10 in (6,7) then 'replied'
    when i % 10 = 8 then 'hot_lead'
    when i % 20 = 9 then 'won'
    else 'lost'
  end,
  true
from generate_series(1, 120) as i;

-- Sent messages for every prospect past 'new'
insert into public.messages (prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at)
select p.id, p.campaign_id, p.client_id, 'email',
  'Quick question about ' || p.business_name,
  'Hi ' || coalesce(p.contact_name,'there') || ', I noticed ' || p.business_name || ' operates in ' || p.location || ' — we provide services that could help your team save time and costs. Open to a quick chat this week? (sandbox message)',
  'initial','approved', now() - interval '6 days', 'sent', now() - interval '6 days'
from public.prospects p
where p.pipeline_status <> 'new';

-- 15 pending messages awaiting approval (for the admin queue)
insert into public.messages (prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, send_status)
select p.id, p.campaign_id, p.client_id, 'email',
  'Idea for ' || p.business_name,
  'Hello ' || coalesce(p.contact_name,'there') || ', reaching out because ' || p.business_name || ' looks like a great fit for our services in ' || p.location || '. Would you be open to learning more? (sandbox message)',
  'initial','pending','not_sent'
from public.prospects p
where p.pipeline_status = 'new'
order by p.created_at
limit 15;

-- Replies for prospects that replied / went hot / won / lost
insert into public.replies (prospect_id, message_id, client_id, body, received_at, intent, intent_confidence, classified_at)
select p.id, m.id, p.client_id,
  case
    when p.pipeline_status in ('hot_lead','won') then 'Yes, we would be interested. Can you share pricing and availability? Our current provider has been unreliable.'
    when p.pipeline_status = 'lost' then 'Thanks but we are not looking for this right now.'
    when random() < 0.5 then 'Maybe later in the year, circle back in Q4.'
    else 'Not interested, please remove us from your list.'
  end,
  now() - interval '2 days',
  case
    when p.pipeline_status in ('hot_lead','won') then 'interested'
    when p.pipeline_status = 'lost' then 'not_interested'
    when random() < 0.5 then 'maybe'
    else 'not_interested'
  end,
  0.910, now() - interval '2 days'
from public.prospects p
join public.messages m on m.prospect_id = p.id and m.message_type = 'initial'
where p.pipeline_status in ('replied','hot_lead','won','lost');

-- Hot leads for interested prospects
insert into public.hot_leads (prospect_id, client_id, campaign_id, reply_id, ai_summary, suggested_action, status, credit_deducted, routed_at, status_updated_at)
select p.id, p.client_id, p.campaign_id, r.id,
  p.business_name || ' replied with clear buying intent: asked for pricing and availability, mentioned their current provider is unreliable. Decision maker: ' || coalesce(p.contact_name,'unknown') || '.',
  'Call within 24 hours with a concrete quote — urgency is high while their current provider is failing.',
  case when p.pipeline_status = 'won' then 'won' when p.pipeline_status = 'lost' then 'lost' else 'new' end,
  true,
  now() - interval '1 day',
  case when p.pipeline_status in ('won','lost') then now() - interval '6 hours' else null end
from public.prospects p
join public.replies r on r.prospect_id = p.id
where p.pipeline_status in ('hot_lead','won');

-- Credit purchases
insert into public.credit_transactions (client_id, amount, type, description) values
('11111111-1111-1111-1111-111111111111', 20, 'purchase', 'Stripe test purchase — starter pack'),
('22222222-2222-2222-2222-222222222222', 40, 'purchase', 'Stripe test purchase — growth pack'),
('33333333-3333-3333-3333-333333333333', 10, 'purchase', 'Stripe test purchase — starter pack');

-- Credit deductions, one per hot lead
insert into public.credit_transactions (client_id, amount, type, reference_id, description)
select client_id, -1, 'hot_lead_deduction', id, 'Hot lead routed: credit deducted'
from public.hot_leads;

-- Payments (Stripe test mode), including one declined
insert into public.payments (client_id, stripe_payment_intent_id, amount_cents, credits_purchased, status) values
('11111111-1111-1111-1111-111111111111','pi_test_3KabwataLaundry001', 4900, 20, 'succeeded'),
('22222222-2222-2222-2222-222222222222','pi_test_3GreenClean001', 8900, 40, 'succeeded'),
('33333333-3333-3333-3333-333333333333','pi_test_3Apex001', 2900, 10, 'succeeded'),
('33333333-3333-3333-3333-333333333333','pi_test_3Apex002declined', 4900, 0, 'failed');

-- Notifications for new hot leads (sandbox logged, not actually sent)
insert into public.notifications (client_id, hot_lead_id, channel, body, status)
select h.client_id, h.id, 'whatsapp',
  'New hot lead: ' || p.business_name || ' is interested. Open your dashboard to act on it.',
  'sandbox_logged'
from public.hot_leads h join public.prospects p on p.id = h.prospect_id
where h.status = 'new';

-- Do-not-contact list
insert into public.do_not_contact (email, reason) values
('optout1@sandbox.shortyharris.test','stop_request'),
('optout2@sandbox.shortyharris.test','opt_out'),
('bounced@sandbox.shortyharris.test','bounce');

-- Holidays (used by the follow-up engine's weekend/holiday avoidance)
insert into public.holidays (holiday_date, name, country_code) values
('2026-07-03','Independence Day (observed)','US'),
('2026-09-07','Labor Day','US'),
('2026-11-26','Thanksgiving','US'),
('2026-12-25','Christmas Day','US');

-- Sample errors for the monitoring screen
insert into public.error_logs (source, error_type, message, severity, retry_count) values
('wf2_generation','gemini_timeout','Gemini API timed out after 30s for prospect batch 4', 'error', 2),
('wf3_send','gmail_rate_limit','Gmail API 429 rate limit hit, backing off', 'warning', 1);

-- Audit trail samples
insert into public.audit_logs (actor_type, action, resource_type, new_values) values
('workflow','prospect_import_completed','prospect_imports','{"imported": 120, "source": "seed"}'),
('workflow','hot_lead_created','hot_leads','{"count": 12}'),
('system','seed_data_loaded','database','{"sandbox": true}');

-- A/B test sample
insert into public.ab_tests (id, name, test_type, status) values
('cccccccc-0000-0000-0000-000000000001','Subject line: question vs statement','message','running');
insert into public.ab_variants (id, test_id, variant_key, config) values
('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','A','{"subject_style":"question"}'),
('dddddddd-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','B','{"subject_style":"statement"}');
insert into public.ab_metrics (test_id, variant_id, metric, value) values
('cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','visit',58),
('cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','reply',9),
('cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002','visit',62),
('cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002','reply',6);


-- =====================================================================
-- DONE. Quick sanity check (optional — run on its own):
--   select
--     (select count(*) from prospects) as prospects,
--     (select count(*) from messages where approval_status='pending') as pending,
--     (select count(*) from hot_leads) as hot_leads;
-- =====================================================================


-- =====================================================================
-- OPTIONAL TEARDOWN — uncomment and run FIRST to wipe before re-running.
-- WARNING: destroys all data in these tables.
-- =====================================================================
-- drop table if exists
--   public.api_request_logs, public.audit_logs, public.error_logs,
--   public.holidays, public.prospect_collisions, public.compliance_checks,
--   public.ab_metrics, public.ab_assignments, public.ab_variants, public.ab_tests,
--   public.notifications, public.hot_leads, public.follow_up_schedules,
--   public.replies, public.messages, public.do_not_contact, public.prospects,
--   public.prospect_imports, public.campaigns, public.payments,
--   public.credit_transactions, public.billing_profiles, public.profiles,
--   public.clients
--   cascade;
-- drop function if exists public.prevent_audit_mutation() cascade;
-- drop function if exists public.current_client_id() cascade;
-- drop function if exists public.is_admin() cascade;
