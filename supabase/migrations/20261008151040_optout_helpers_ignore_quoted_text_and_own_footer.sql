create or replace function public.optout_clean_text(p_body text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(p_body,''),
                 -- cut quoted history: Outlook/Yahoo separators and Gmail "On ... wrote:" lines
                 '(-{2,}\s*(original message|forwarded message)\s*-{2,}|\mOn [^\n]{0,160}wrote:|_{8,}\s*From:).*$', '', 'is'),
               -- remove our own footer sentence: reply "unsubscribe" ... / odpovezte slovem "unsubscribe" ...
               '(reply|odpov\S+)\s+(with\s+|slovem\s+)?["“”'']?unsubscribe["“”'']?[^.]*\.?', ' ', 'gi'),
             -- remove our own footer link line: "unsubscribe here: URL" / "odhlaste se zde: URL"
             '(unsubscribe here|odhlaste se zde):?\s*\S+', ' ', 'gi'),
           -- remove the footer lead-in
           'to stop receiving these emails,?', ' ', 'gi')
$$;

create or replace function public.reply_has_optout(p_body text)
returns boolean
language sql
immutable
as $$
  select public.optout_clean_text(p_body) ~* (
    '(\munsubscribe\M|\mremove me\M|\mremove my\M|\mtake me off\M|\mopt[ -]?out\M'
    || '|\mstop emailing\M|\mstop contacting\M|\mdo not (email|contact)\M'
    || '|\mdon''t (email|contact)\M|\mno longer wish\M|\mleave me alone\M'
    || '|odhlás|odhlas|odhláš|odhlas'
    || '|zrušit odběr|zrusit odber'
    || '|nezasílejte|nezasilejte|neposílejte|neposilejte'
    || '|odstraňte m|odstrante m|vymažte m|vymazte m'
    || '|přestaňte (mi )?(posílat|zasílat)|prestante (mi )?(posilat|zasilat)'
    || '|nechci (dostávat|dostavat|žádné|zadne)'
    || ')');
$$;