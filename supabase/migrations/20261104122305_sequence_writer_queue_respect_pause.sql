-- The "Pause sequence" button on a prospect sets prospects.sequence_paused, and
-- sendable_messages honours it, so nothing could be SENT to a paused prospect.
-- But the queue that feeds the upfront sequence writer (WF19) did not check it,
-- so a paused prospect still had three follow-up drafts written, costing Gemini
-- calls and filling the client's approvals queue with mail that could not go out.
-- Same for followups_stopped, which is a permanent version of the same intent.
create or replace view public.sequence_writer_queue as
  select p.id as prospect_id, p.client_id, p.campaign_id, p.business_name,
         p.category, p.contact_name, p.unsubscribe_token,
         s.step as message_type, s.day_label
  from (prospects p
        join campaigns c
          on c.id = p.campaign_id and c.upfront_sequence = true and c.status = 'active')
       cross join (values ('follow_up_d3', 3), ('follow_up_d7', 7), ('follow_up_d14', 14))
         s(step, day_label)
  where coalesce(p.is_sandbox, false) = false
    and coalesce(p.sequence_paused, false) = false
    and coalesce(p.followups_stopped, false) = false
    and p.pipeline_status <> all (array['replied','hot_lead','won','lost','called','bounced','generation_failed','new','generating'])
    and exists (select 1 from messages i
                 where i.prospect_id = p.id and i.message_type = 'initial'
                   and i.approval_status <> 'rejected' and i.send_status <> 'failed')
    and not exists (select 1 from messages f
                     where f.prospect_id = p.id and f.message_type = s.step
                       and f.approval_status <> 'rejected' and f.send_status <> 'failed')
    and not exists (select 1 from do_not_contact d
                     where lower(d.email) = lower(p.email));;
