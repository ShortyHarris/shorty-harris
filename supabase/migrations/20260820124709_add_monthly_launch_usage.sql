
-- Create the monthly_launch_usage table
CREATE TABLE public.monthly_launch_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month           text NOT NULL,  -- format: YYYY-MM
  launch_count    integer NOT NULL DEFAULT 0 CHECK (launch_count >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_launch_usage_client_month_unique UNIQUE (client_id, month)
);

-- Index for fast per-client-month lookups
CREATE INDEX idx_monthly_launch_usage_client_month
  ON public.monthly_launch_usage (client_id, month);

-- Enable RLS (consistent with all other tables)
ALTER TABLE public.monthly_launch_usage ENABLE ROW LEVEL SECURITY;

-- RLS: clients can only see their own usage row
CREATE POLICY "Clients can view own launch usage"
  ON public.monthly_launch_usage
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- RLS: only service role / n8n can insert or update (not the client frontend directly)
CREATE POLICY "Service role full access to launch usage"
  ON public.monthly_launch_usage
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_monthly_launch_usage_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_monthly_launch_usage_updated_at
  BEFORE UPDATE ON public.monthly_launch_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_monthly_launch_usage_updated_at();

-- pg_cron: reset all launch counts to 0 on the 1st of every month at midnight UTC
SELECT cron.schedule(
  'reset-monthly-launch-counts',
  '0 0 1 * *',
  $$UPDATE public.monthly_launch_usage SET launch_count = 0$$
);
