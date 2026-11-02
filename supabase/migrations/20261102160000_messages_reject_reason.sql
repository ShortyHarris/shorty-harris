-- Why a draft was rejected. Until now every way a draft could leave the queue (a person clicking
-- Reject, a draft being replaced by a rewrite, a prospect replying, Stop follow-ups) wrote the same
-- approval_status = 'rejected', so "Rejected all time" counted replaced drafts as client rejections
-- (PostKing showed 246; 237 were older drafts replaced by research rewrites on 2026-10-27).
--
--   manual             a signed-in person rejected it
--   superseded         an older first-touch draft replaced by a newer one for the same prospect
--   prospect_closed    the prospect replied / became a hot lead / won / lost / bounced, so unsent
--                      follow-ups were cancelled automatically
--   followups_stopped  someone used Stop follow-ups on the prospect
--   sequence_cancelled cancel_unsent_sequence was called for the prospect
--   system             rejected by a backend process with no more specific reason
--   unknown            rejected before reasons were recorded and no rule below explains it

alter table public.messages add column if not exists reject_reason text;

alter table public.messages drop constraint if exists messages_reject_reason_check;
alter table public.messages add constraint messages_reject_reason_check check (
  reject_reason is null or reject_reason in
    ('manual','superseded','prospect_closed','followups_stopped','sequence_cancelled','system','unknown'));

-- ── Backfill ────────────────────────────────────────────────────────────────
-- rejected_by has only been recorded since 20261030120705, so older rows fall back to what the
-- data can still prove (a newer first-touch exists, the prospect closed, follow-ups were stopped).
update public.messages m
   set reject_reason = case
     when m.message_type = 'initial' and exists (
            select 1 from public.messages o
             where o.prospect_id = m.prospect_id and o.id <> m.id
               and o.message_type = 'initial' and o.created_at > m.created_at)
       then 'superseded'
     when m.rejected_by is not null then 'manual'
     when m.message_type <> 'initial' and coalesce(p.followups_stopped, false) then 'followups_stopped'
     when m.message_type <> 'initial'
          and p.pipeline_status in ('replied','hot_lead','won','lost','called','bounced') then 'prospect_closed'
     when m.rejected_at >= '2026-10-30 12:07:05+00' then 'system'
     else 'unknown'
   end
  from public.prospects p
 where p.id = m.prospect_id and m.approval_status = 'rejected' and m.reject_reason is null;

-- ── Record the reason on every new rejection ────────────────────────────────
create or replace function public.messages_set_rejected_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT' and new.approval_status = 'rejected')
     or (tg_op = 'UPDATE' and new.approval_status = 'rejected' and old.approval_status is distinct from 'rejected') then
    new.rejected_at := case when tg_op = 'INSERT' then coalesce(new.rejected_at, now()) else now() end;
    new.rejected_by := coalesce(case when tg_op = 'INSERT' then new.rejected_by end,
                                case when pg_trigger_depth() = 1 then auth.uid() end);
    if new.reject_reason is null then
      new.reject_reason := case
        -- Another live first-touch for the same prospect means this one is being replaced.
        when new.message_type = 'initial' and exists (
               select 1 from public.messages o
                where o.prospect_id = new.prospect_id and o.id <> new.id and o.message_type = 'initial'
                  and (o.approval_status in ('pending','approved') or o.send_status = 'sent'))
          then 'superseded'
        when new.rejected_by is not null then 'manual'
        else 'system'
      end;
    end if;
  elsif tg_op = 'UPDATE' and new.approval_status is distinct from 'rejected' and old.approval_status = 'rejected' then
    new.rejected_at := null;
    new.rejected_by := null;
    new.reject_reason := null;
  end if;
  return new;
end; $function$;

-- A rewrite usually arrives after the old draft was rejected, so relabel then.
create or replace function public.messages_mark_superseded()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.message_type = 'initial' then
    update public.messages o
       set reject_reason = 'superseded'
     where o.prospect_id = new.prospect_id and o.id <> new.id and o.message_type = 'initial'
       and o.approval_status = 'rejected' and o.send_status = 'not_sent'
       and o.created_at < new.created_at
       and coalesce(o.reject_reason, 'system') in ('system','unknown');
  end if;
  return null;
end; $function$;

drop trigger if exists trg_messages_mark_superseded on public.messages;
create trigger trg_messages_mark_superseded
  after insert on public.messages
  for each row execute function public.messages_mark_superseded();

-- ── Automatic cancellations say so ──────────────────────────────────────────
-- Patch the three functions in place so their bodies stay exactly as live, failing loudly if the
-- text they patch has drifted.
do $$
declare
  v_def text; v_new text;
  v_patches text[][] := array[
    ['public.stop_followups(uuid)',
     $a$update public.messages set approval_status = 'rejected', updated_at = now()$a$,
     $b$update public.messages set approval_status = 'rejected', reject_reason = 'followups_stopped', updated_at = now()$b$],
    ['public.cancel_unsent_sequence(uuid)',
     $a$update public.messages set approval_status = 'rejected', updated_at = now()$a$,
     $b$update public.messages set approval_status = 'rejected', reject_reason = 'sequence_cancelled', updated_at = now()$b$],
    ['public.cancel_follow_ups_on_stop()',
     $a$set approval_status = 'rejected', updated_at = now()$a$,
     $b$set approval_status = 'rejected', reject_reason = 'prospect_closed', updated_at = now()$b$]
  ];
  i int;
begin
  for i in 1 .. array_length(v_patches, 1) loop
    v_def := pg_get_functiondef(v_patches[i][1]::regprocedure);
    if position(v_patches[i][2] in v_def) = 0 then
      raise exception 'reject_reason patch: text not found in %', v_patches[i][1];
    end if;
    v_new := replace(v_def, v_patches[i][2], v_patches[i][3]);
    execute v_new;
  end loop;
end $$;

-- ── Counts: only drafts a person turned down are "rejected" ─────────────────
-- Each anchor is a single line that appears exactly once in the live function, so the patch does
-- not depend on line endings or indentation (pasting into the SQL editor can change both).
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.approved_queue(uuid,text,text,text,text,integer,integer)'::regprocedure);
  -- End of the rejected_total line; rejected_today's line ends differently ("and x.rejected_at ...").
  if (length(v_def) - length(replace(v_def, $a$x.approval_status = 'rejected'))$a$, ''))) / length($a$x.approval_status = 'rejected'))$a$) <> 1 then
    raise exception 'reject_reason patch: approved_queue rejected_total anchor not found exactly once';
  end if;
  v_new := replace(v_def,
    $a$x.approval_status = 'rejected'))$a$,
    $b$x.approval_status = 'rejected' and x.reject_reason in ('manual','unknown')),
      'replaced_total', (select count(*) from public.messages x
          where x.client_id = p_client_id and x.approval_status = 'rejected' and x.reject_reason = 'superseded'),
      'auto_cancelled_total', (select count(*) from public.messages x
          where x.client_id = p_client_id and x.approval_status = 'rejected'
            and x.reject_reason in ('prospect_closed','followups_stopped','sequence_cancelled','system')))$b$);
  execute v_new;

  v_def := pg_get_functiondef('public.client_funnel(uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'select m.prospect_id, m.send_status, m.approval_status', ''))) / length('select m.prospect_id, m.send_status, m.approval_status') <> 1
     or position($a$'rejected', (select count(*) from msg where approval_status = 'rejected'),$a$ in v_def) = 0 then
    raise exception 'reject_reason patch: client_funnel anchors not found';
  end if;
  v_new := replace(replace(v_def,
    'select m.prospect_id, m.send_status, m.approval_status',
    'select m.prospect_id, m.send_status, m.approval_status, m.reject_reason'),
    $a$'rejected', (select count(*) from msg where approval_status = 'rejected'),$a$,
    $b$'rejected', (select count(*) from msg where approval_status = 'rejected' and reject_reason in ('manual','unknown')),
    'drafts_replaced', (select count(*) from msg where approval_status = 'rejected' and reject_reason = 'superseded'),$b$);
  execute v_new;
end $$;
