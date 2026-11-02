-- Every outreach draft signs off with the sender's first name when the client has one
-- (clients.representative_name), then the brand:
--     S přáním krásného dne,
--     Martin
--     TUTEL s.r.o.
-- WF2 (first touch), WF5 and WF19 (follow-ups) only ASK Gemini to do this. Drafts written before
-- representative_name was filled in (2026-10-30) sign with the brand alone, and nothing checked.
-- This makes the database enforce it on every new draft, fixes the unsent drafts, and lets
-- Approvals flag any draft whose sign-off still has no name.
--
-- No name on the client stays a deliberate "brand only" sign-off (see
-- 20261030114937_drop_default_representative_name_trigger: contact_name is not the signer).
-- Only the name line is added; role lines and wording are left as written.

-- Where the compliance footer starts (the localized "commercial message" line, or the older "--"),
-- or 0 when the body has none. Everything before it is the email the sender wrote.
create or replace function public.email_footer_start(p_body text)
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(regexp_instr(p_body,
    E'\\n\\n(--|This is a commercial message|Obchodní sdělení|Werbliche Nachricht|Obchodné oznámenie|Wiadomość handlowa|Message commercial|Mensaje comercial|Comunicazione commerciale|Commercieel bericht)'), 0);
$function$;

-- First name of the person who signs a client's emails ("Dana Whitfield" -> "Dana"), or null.
create or replace function public.sign_off_first_name(p_representative text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select nullif(split_part(btrim(coalesce(p_representative, '')), ' ', 1), '');
$function$;

-- True when the sign-off (the last 4 non-empty lines before the footer) contains the first name,
-- or when there is no representative to look for.
create or replace function public.sign_off_has_name(p_body text, p_representative text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare v_first text := public.sign_off_first_name(p_representative); v_pos int; v_main text; v_tail text;
begin
  if v_first is null or p_body is null then return true; end if;
  v_pos := public.email_footer_start(p_body);
  v_main := case when v_pos > 0 then left(p_body, v_pos - 1) else p_body end;
  select string_agg(l, E'\n' order by n) into v_tail from (
    select l, n from (
      select btrim(l) l, n from unnest(string_to_array(v_main, E'\n')) with ordinality as t(l, n)
    ) x where l <> '' order by n desc limit 4) y;
  return position(lower(v_first) in lower(coalesce(v_tail, ''))) > 0;
end; $function$;

-- Puts the first name into a sign-off that lacks it, without touching anything else:
--   "...,\nTUTEL s.r.o."  ->  "...,\nMartin\nTUTEL s.r.o."   (brand is the last line)
--   "...,\n"              ->  "...,\nMartin\nTUTEL s.r.o."   (closing line with nothing after it)
-- Any other shape is left alone (and shows as "no name in sign-off" in Approvals).
create or replace function public.ensure_sign_off_name(p_body text, p_representative text, p_business text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_first text := public.sign_off_first_name(p_representative);
  v_pos int; v_main text; v_footer text; v_last text; v_cut int;
begin
  if v_first is null or p_body is null or public.sign_off_has_name(p_body, p_representative) then
    return p_body;
  end if;
  v_pos := public.email_footer_start(p_body);
  v_main := rtrim(case when v_pos > 0 then left(p_body, v_pos - 1) else p_body end, E' \t\r\n');
  v_footer := case when v_pos > 0 then substr(p_body, v_pos) else '' end;
  v_cut := length(v_main) - position(E'\n' in reverse(v_main)) + 1;  -- index of the last newline
  v_last := btrim(case when position(E'\n' in v_main) > 0 then substr(v_main, v_cut + 1) else v_main end);

  if p_business is not null and lower(v_last) = lower(btrim(p_business)) and position(E'\n' in v_main) > 0 then
    return left(v_main, v_cut) || v_first || E'\n' || v_last || v_footer;
  elsif right(v_last, 1) = ',' then
    return v_main || E'\n' || v_first || coalesce(E'\n' || nullif(btrim(p_business), ''), '') || v_footer;
  end if;
  return p_body;
end; $function$;

-- ── Enforce on every new draft ──────────────────────────────────────────────
-- Insert only: a person's later edit to the body is theirs to keep.
create or replace function public.messages_ensure_sign_off_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rep text; v_business text;
begin
  if new.body is null or coalesce(new.channel, 'email') <> 'email' then return new; end if;
  select cl.representative_name, cl.business_name into v_rep, v_business
    from public.clients cl where cl.id = new.client_id;
  new.body := public.ensure_sign_off_name(new.body, v_rep, v_business);
  return new;
end; $function$;

drop trigger if exists trg_messages_ensure_sign_off_name on public.messages;
create trigger trg_messages_ensure_sign_off_name
  before insert on public.messages
  for each row execute function public.messages_ensure_sign_off_name();

-- ── Fix the drafts that have not gone out ───────────────────────────────────
update public.messages m
   set body = public.ensure_sign_off_name(m.body, cl.representative_name, cl.business_name),
       updated_at = now()
  from public.clients cl
 where cl.id = m.client_id
   and cl.representative_name is not null
   and m.send_status = 'not_sent'
   and m.approval_status in ('pending', 'approved')
   and not public.sign_off_has_name(m.body, cl.representative_name)
   and public.ensure_sign_off_name(m.body, cl.representative_name, cl.business_name) is distinct from m.body;

-- ── Approvals: flag drafts whose sign-off still has no name ─────────────────
-- Per row (sign_off_missing_name) and as a count. Same single-line, exactly-once anchors as the
-- earlier approved_queue patches, so pasting into the SQL editor cannot break them.
do $$
declare
  v_def text;
  v_row_anchor text := $a$'policy_held', n.policy_held,$a$;
  v_count_anchor text := $a$'policy_held', (select count(*) from visible where policy_held),$a$;
begin
  v_def := pg_get_functiondef('public.approved_queue(uuid,text,text,text,text,integer,integer)'::regprocedure);
  if position('sign_off_missing_name' in v_def) > 0 then
    raise notice 'approved_queue already flags sign-offs, skipping';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_row_anchor, ''))) / length(v_row_anchor) <> 1
     or (length(v_def) - length(replace(v_def, v_count_anchor, ''))) / length(v_count_anchor) <> 1 then
    raise exception 'sign-off patch: approved_queue anchors not found exactly once';
  end if;
  v_def := replace(v_def, v_row_anchor, v_row_anchor || $b$
        'sign_off_missing_name', not public.sign_off_has_name(n.body,
            (select cl.representative_name from public.clients cl where cl.id = p_client_id)),$b$);
  v_def := replace(v_def, v_count_anchor, v_count_anchor || $b$
        'sign_off_missing_name', (select count(*) from (
            select body from pend_visible union all select body from visible) d
          where not public.sign_off_has_name(d.body,
            (select cl.representative_name from public.clients cl where cl.id = p_client_id))),$b$);
  execute v_def;
end $$;
