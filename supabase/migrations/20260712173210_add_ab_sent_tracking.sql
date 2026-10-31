alter table ab_metrics add column if not exists prospect_id uuid references prospects(id);

create unique index if not exists ab_metrics_variant_prospect_metric_key
  on ab_metrics(variant_id, prospect_id, metric)
  where prospect_id is not null;

create or replace function record_ab_sent(p_prospect_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_test_id uuid;
  v_variant_id uuid;
begin
  select test_id, variant_id into v_test_id, v_variant_id
  from ab_assignments
  where prospect_id = p_prospect_id
  order by assigned_at desc
  limit 1;

  if v_variant_id is null then
    return;
  end if;

  insert into ab_metrics (test_id, variant_id, prospect_id, metric, value, recorded_at)
  values (v_test_id, v_variant_id, p_prospect_id, 'sent', 1, now())
  on conflict (variant_id, prospect_id, metric) where prospect_id is not null do nothing;
end;
$$;

grant execute on function record_ab_sent(uuid) to anon, authenticated, service_role;

insert into ab_metrics (test_id, variant_id, prospect_id, metric, value, recorded_at)
select a.test_id, a.variant_id, m.prospect_id, 'sent', 1, m.sent_at
from messages m
join ab_assignments a on a.prospect_id = m.prospect_id
where m.send_status = 'sent'
on conflict (variant_id, prospect_id, metric) where prospect_id is not null do nothing;