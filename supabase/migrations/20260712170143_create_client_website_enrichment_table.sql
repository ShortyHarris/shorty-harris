create table if not exists client_website_enrichment (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  website_url text not null,
  business_type text,
  location text,
  contact_email text,
  contact_phone text,
  founder_name text,
  services jsonb,
  target_customer_profiles jsonb,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists client_website_enrichment_client_id_key on client_website_enrichment(client_id) where client_id is not null;