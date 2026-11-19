-- A mailbox whose name matches the domain name is a shared company inbox,
-- e.g. pre@pre.cz, marcus@marcus.com, pipni@pipni.cz, adap@adap.ua.edu.
-- The top-level domain (.cz, .com) is not compared.
CREATE OR REPLACE FUNCTION public.is_generic_mailbox(e text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with a as (
    select split_part(lower(coalesce(e,'')),'@',1) as l,
           string_to_array(split_part(lower(coalesce(e,'')),'@',2),'.') as d
  )
  select a.l ~ '^(info|office|kancelar|kancelář|podatelna|elpodatelna|recepce|reception|sekretariat|obchod|sprava|správa|kontakt|contact|hello|hi|support|podpora|fakturace|ucetni|ucetnictvi|dispecink|informace|objednavky|poptavka|poptavky|zakaznicky|helpdesk|admin|administrator|sales|marketing|mzdy|ekonom|concierge|email|mail|post|team|reditel|jednatel|servis|provoz|studio|atelier|ateliér|architekti|architekt|projekce|projekty|statika|job|jobs|prace|práce|kariera|kariéra|hr|booking|rezervace|reklamace|prodej|noreply|no-reply|nereply)([._-].*)?$'
      or (a.l <> '' and coalesce(array_length(a.d,1),0) >= 2
          and a.l = any(a.d[1:array_length(a.d,1)-1]))
  from a
$function$
;
