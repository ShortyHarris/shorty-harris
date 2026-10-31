ALTER FUNCTION public.prevent_audit_mutation() SET search_path TO 'public';
ALTER FUNCTION public.record_ab_sent(p_prospect_id uuid) SET search_path TO 'public';
ALTER FUNCTION public.claim_next_discovery_job() SET search_path TO 'public';
ALTER FUNCTION public.release_discovery_lock(p_queue_id uuid, p_status text, p_result jsonb, p_error text) SET search_path TO 'public';