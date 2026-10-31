
create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_prospects_business_name_trgm on public.prospects using gin (business_name extensions.gin_trgm_ops);
create index if not exists idx_prospects_email_trgm on public.prospects using gin (email extensions.gin_trgm_ops);
create index if not exists idx_prospects_contact_name_trgm on public.prospects using gin (contact_name extensions.gin_trgm_ops);
create index if not exists idx_prospects_created_at on public.prospects (created_at desc);
