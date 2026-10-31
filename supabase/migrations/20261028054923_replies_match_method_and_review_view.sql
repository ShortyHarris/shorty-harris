alter table public.replies add column if not exists match_method text;
comment on column public.replies.match_method is 'How the reply was attached to a prospect: thread (replied inside our email thread), email (exact address we wrote to), or domain (company domain only, a weak match that must never create a hot lead on its own).';

create or replace view public.replies_match_review as
select r.id as reply_id, c.business_name as client, p.business_name as prospect, p.email as prospect_email,
       r.intent, r.match_method, r.received_at, left(r.body, 240) as excerpt,
       exists (select 1 from public.hot_leads h where h.prospect_id = p.id) as has_hot_lead
  from public.replies r
  join public.prospects p on p.id = r.prospect_id
  join public.clients c on c.id = r.client_id
 where r.match_method = 'domain'
   and r.intent not in ('auto_reply','bounced','automated','out_of_office')
 order by r.received_at desc;

revoke all on public.replies_match_review from public, anon, authenticated;
grant select on public.replies_match_review to service_role