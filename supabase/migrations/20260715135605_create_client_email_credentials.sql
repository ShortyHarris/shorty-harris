CREATE TABLE public.client_email_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  auth_method text NOT NULL DEFAULT 'oauth' CHECK (auth_method IN ('oauth', 'app_password')),
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error', 'pending')),
  error_message text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_email_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all credentials"
  ON public.client_email_credentials
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Clients can view own credentials"
  ON public.client_email_credentials
  FOR SELECT
  USING (
    client_id IN (SELECT profiles.client_id FROM public.profiles WHERE profiles.id = auth.uid())
  );

COMMENT ON TABLE public.client_email_credentials IS 'Stores OAuth refresh tokens (or app passwords) for per-client Gmail sending. One credential per client.';