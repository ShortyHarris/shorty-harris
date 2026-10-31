with dupes as (
  select lower(trim(email)) as email, client_id
  from prospects
  where email is not null and email <> ''
  group by lower(trim(email)), client_id
  having count(*) > 1
),
ranked as (
  select p.id,
    row_number() over (
      partition by lower(trim(p.email)), p.client_id
      order by
        (select count(*) from hot_leads h where h.prospect_id = p.id) desc,
        (select count(*) from replies r where r.prospect_id = p.id) desc,
        (select count(*) from messages m where m.prospect_id = p.id) desc,
        p.created_at asc
    ) as rn
  from prospects p
  join dupes d on lower(trim(p.email)) = d.email and p.client_id = d.client_id
)
delete from prospects where id in (select id from ranked where rn > 1);