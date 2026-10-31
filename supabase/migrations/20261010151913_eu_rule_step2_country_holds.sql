create table if not exists public.country_send_holds (
  country text primary key,
  reason text not null,
  cleared boolean not null default false,
  cleared_at timestamptz,
  cleared_by text
);
alter table public.country_send_holds enable row level security;
insert into public.country_send_holds (country, reason) values
  ('DE','Germany: B2B cold email needs prior consent. Confirm the legal basis before sending.'),
  ('AT','Austria: cold email needs prior consent. Confirm the legal basis before sending.')
on conflict (country) do nothing;