alter table public.clients add column if not exists country text;
alter table public.campaigns add column if not exists country text;

create or replace function public.is_eu_country(p_country text)
returns boolean language sql immutable set search_path to 'public' as $$
  select upper(coalesce(p_country,'')) in
   ('AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE');
$$;

update public.clients set country = 'CZ' where id = '40d3f053-dc07-49d6-a3c7-3ecba00f7c88';
update public.clients set country = 'US' where country is null;
update public.campaigns c set country = cl.country from public.clients cl where cl.id = c.client_id and c.country is null;