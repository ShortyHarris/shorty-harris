-- Suppression covers the prospect record, not only the send.
--
-- An address on do_not_contact is already refused at send time (sendable_messages
-- and WF3 "Check DNC"). The prospect record itself was left open: followups_stopped
-- false, unsent drafts still in the approval queue, schedules still live. So the
-- Prospects screen did not show the person as suppressed (Daisy Sells 406, Oct 7
-- feedback item 2).
--
-- From now on, when an address is added to do_not_contact, every prospect record
-- with that email, in any client or campaign, gets:
--   * followups_stopped = true
--   * unsent drafts (any step) rejected with reject_reason 'prospect_closed'
--   * pending follow-up schedules cancelled
-- A prospect imported later with an address already on the list starts with
-- followups_stopped = true, so a re-import cannot bypass suppression.
--
-- Nothing is sent by this migration. It only closes records that the sender
-- already refuses. Existing rows are handled separately in 02_backfill.

create or replace function public.suppress_prospects_for_email(p_email text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer := 0;
begin
  if p_email is null or btrim(p_email) = '' then return 0; end if;

  with flagged as (
    update public.prospects p
       set followups_stopped = true, updated_at = now()
     where lower(p.email) = lower(btrim(p_email)) and not p.followups_stopped
    returning 1
  )
  select count(*) into v_n from flagged;

  update public.messages m
     set approval_status = 'rejected', reject_reason = 'prospect_closed', updated_at = now()
   where m.prospect_id in (select id from public.prospects where lower(email) = lower(btrim(p_email)))
     and m.send_status = 'not_sent'
     and m.approval_status in ('pending', 'approved');

  update public.follow_up_schedules s
     set status = 'cancelled', updated_at = now()
   where s.prospect_id in (select id from public.prospects where lower(email) = lower(btrim(p_email)))
     and s.status in ('pending', 'generating');

  return v_n;
end;
$function$;

revoke all on function public.suppress_prospects_for_email(text) from public, anon, authenticated;

create or replace function public.trg_suppress_prospects_on_dnc()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.suppress_prospects_for_email(NEW.email);
  return NEW;
end;
$function$;

drop trigger if exists trg_suppress_prospects_on_dnc on public.do_not_contact;
create trigger trg_suppress_prospects_on_dnc
  after insert or update of email on public.do_not_contact
  for each row execute function public.trg_suppress_prospects_on_dnc();

create or replace function public.trg_suppress_new_prospect_on_dnc()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.email is not null and exists (
       select 1 from public.do_not_contact d where lower(d.email) = lower(NEW.email)) then
    NEW.followups_stopped := true;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_suppress_new_prospect_on_dnc on public.prospects;
create trigger trg_suppress_new_prospect_on_dnc
  before insert on public.prospects
  for each row execute function public.trg_suppress_new_prospect_on_dnc();
