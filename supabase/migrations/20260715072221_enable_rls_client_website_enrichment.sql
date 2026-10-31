-- Enable RLS on client_website_enrichment and lock it down to match the
-- admin/client-scoped pattern already used on clients, messages, prospects.

ALTER TABLE public.client_website_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_client_website_enrichment
ON public.client_website_enrichment
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY client_own_client_website_enrichment
ON public.client_website_enrichment
FOR SELECT
USING (client_id = current_client_id());

-- Writes should go through the backend (n8n / service_role), not directly
-- from client sessions, so authenticated keeps read-only access via the
-- policy above and loses blanket write privileges. anon has no legitimate
-- reason to touch this table at all.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_website_enrichment FROM authenticated;
REVOKE ALL ON public.client_website_enrichment FROM anon;
