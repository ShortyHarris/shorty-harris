ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS representative_name text;

COMMENT ON COLUMN public.clients.representative_name IS
  'Name of the person emails are signed off from, e.g. "Eugene Wilson". If null, emails sign off with the business name only.';