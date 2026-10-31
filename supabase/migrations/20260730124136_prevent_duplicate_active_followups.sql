CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_followup_per_prospect_day
ON public.follow_up_schedules (prospect_id, follow_up_day)
WHERE status IN ('pending', 'generating');