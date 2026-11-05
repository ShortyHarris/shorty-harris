CREATE OR REPLACE FUNCTION public.is_generic_mailbox(e text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select split_part(lower(coalesce(e,'')),'@',1) ~ '^(info|office|kancelar|kancelář|podatelna|elpodatelna|recepce|reception|sekretariat|obchod|sprava|správa|kontakt|contact|hello|hi|support|podpora|fakturace|ucetni|ucetnictvi|dispecink|informace|objednavky|poptavka|poptavky|zakaznicky|helpdesk|admin|administrator|sales|marketing|mzdy|ekonom|concierge|email|mail|post|team|reditel|jednatel|servis|provoz|studio|atelier|ateliér|architekti|architekt|projekce|projekty|statika|job|jobs|prace|práce|kariera|kariéra|hr|booking|rezervace|reklamace|prodej|noreply|no-reply|nereply)([._-].*)?$'
$function$
;
