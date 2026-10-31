create or replace function public._coerce_json_array(j jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare parsed jsonb;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'array' then return j; end if;
  if jsonb_typeof(j) = 'string' then
    begin
      parsed := (j #>> '{}')::jsonb;
      if jsonb_typeof(parsed) = 'array' then return parsed; end if;
    exception when others then
      null;
    end;
  end if;
  return '[]'::jsonb;
end;
$$;

create or replace function public.normalize_enrichment_json()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.services := public._coerce_json_array(new.services);
  new.target_customer_profiles := public._coerce_json_array(new.target_customer_profiles);
  return new;
end;
$$;

drop trigger if exists trg_0_normalize_enrichment_json on public.client_website_enrichment;
create trigger trg_0_normalize_enrichment_json
  before insert or update on public.client_website_enrichment
  for each row execute function public.normalize_enrichment_json();

-- Repair existing rows that were stored as JSON strings
update public.client_website_enrichment
set services = public._coerce_json_array(services),
    target_customer_profiles = public._coerce_json_array(target_customer_profiles)
where jsonb_typeof(services) <> 'array' or jsonb_typeof(target_customer_profiles) <> 'array';