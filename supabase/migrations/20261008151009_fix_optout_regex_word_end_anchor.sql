create or replace function public.honour_optout_language()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_prospect_id uuid;
  -- English phrases END with \M (end of word). They previously ended with \m
  -- (start of word), which can never match, so no English opt-out was ever honoured.
  v_pattern text :=
    '(\munsubscribe\M|\mremove me\M|\mremove my\M|\mtake me off\M|\mopt[ -]?out\M'
    || '|\mstop emailing\M|\mstop contacting\M|\mdo not (email|contact)\M'
    || '|\mdon''t (email|contact)\M|\mno longer wish\M|\mleave me alone\M'
    || '|odhlás|odhlas|odhláš|odhlas'
    || '|zrušit odběr|zrusit odber'
    || '|nezasílejte|nezasilejte|neposílejte|neposilejte'
    || '|odstraňte m|odstrante m|vymažte m|vymazte m'
    || '|přestaňte (mi )?(posílat|zasílat)|prestante (mi )?(posilat|zasilat)'
    || '|nechci (dostávat|dostavat|žádné|zadne)'
    || ')';
begin
  if new.body is null then
    return new;
  end if;

  if new.body !~* v_pattern then
    return new;
  end if;

  select email, id into v_email, v_prospect_id
  from public.prospects where id = new.prospect_id;

  if v_email is null then
    return new;
  end if;

  insert into public.do_not_contact (email, reason, source_prospect_id)
  values (lower(v_email), 'opt_out', v_prospect_id)
  on conflict (lower(email)) where email is not null do nothing;

  update public.follow_up_schedules
    set status = 'cancelled', updated_at = now()
    where prospect_id = v_prospect_id and status in ('pending', 'generating');

  update public.messages
    set send_status = 'blocked_dnc', updated_at = now()
    where prospect_id = v_prospect_id
      and send_status in ('not_sent', 'queued', 'scheduled');

  return new;
end;
$function$;