-- Apply 01's suppression to addresses that were already on do_not_contact.
-- Requires 01 (uses public.suppress_prospects_for_email).
--
-- Dry run on 2026-11-04: 25 addresses -> 30 prospect records
-- (Courtesy Cleaning 13, Coffeehouse 7, TUTEL 5, Mountains Mowing 3, PostKing 2).
-- All 30 currently have followups_stopped = false. One approved, unsent
-- follow_up_d14 is rejected. No pending schedules. All 30 are already refused by
-- the sender, so this changes what the screens show, not what gets sent.
--
-- To undo: the rejected draft has reject_reason 'prospect_closed' and rejected_at
-- at the time this ran; the 30 prospects have updated_at at the time this ran.

select public.suppress_prospects_for_email(d.email)
  from (select distinct lower(email) as email
          from public.do_not_contact
         where email is not null and btrim(email) <> '') d;
