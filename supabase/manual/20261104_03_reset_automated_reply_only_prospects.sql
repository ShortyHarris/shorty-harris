-- Prospects marked 'replied' when their only replies were automatic.
--
-- Before the reply-intent fix of 2026-10-27/28, an out-of-office or other
-- automatic reply moved the prospect to 'replied', which stopped the sequence and
-- counted as a real reply. Replies since then keep the sequence going (checked:
-- both out-of-office replies on 2026-10-28 stayed 'contacted').
--
-- Dry run on 2026-11-04: 15 prospects (Courtesy Cleaning 9, Coffeehouse 6). Their
-- automatic replies arrived 2026-07-06 to 2026-08-12. 13 received only the first
-- email; 2 received all four. No live drafts or schedules.
--
-- Set them back to 'contacted' so automatic replies stop counting as human
-- replies, and set followups_stopped so this does NOT restart outreach three
-- months late. Reviving those 13 sequences is the client's decision; if wanted,
-- clear followups_stopped for the chosen prospects afterwards.
--
-- Nothing is sent by this migration.

update public.prospects p
   set pipeline_status = 'contacted',
       followups_stopped = true,
       updated_at = now()
 where p.pipeline_status = 'replied'
   and exists (select 1 from public.replies r where r.prospect_id = p.id)
   and not exists (
         select 1 from public.replies h
          where h.prospect_id = p.id
            and (h.intent is null or h.intent not in ('out_of_office', 'automated', 'auto_reply')));
