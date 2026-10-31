-- Lock down admin_notification_recipients: remove public/anon/authenticated access
-- and drop SECURITY DEFINER so it can't bypass RLS for whoever queries it.

REVOKE ALL ON public.admin_notification_recipients FROM anon;
REVOKE ALL ON public.admin_notification_recipients FROM authenticated;

DROP VIEW IF EXISTS public.admin_notification_recipients;

CREATE VIEW public.admin_notification_recipients
WITH (security_invoker = true)
AS
SELECT p.id,
       p.full_name,
       u.email
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.role = 'admin'::text;

-- Only service_role (used by your n8n backend) and postgres retain access.
GRANT SELECT ON public.admin_notification_recipients TO service_role;
