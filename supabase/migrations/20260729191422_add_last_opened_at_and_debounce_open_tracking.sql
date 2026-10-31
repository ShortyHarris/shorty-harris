ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

UPDATE public.messages
  SET last_opened_at = opened_at
  WHERE opened_at IS NOT NULL AND last_opened_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_email_open(p_message_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $function$
  UPDATE messages
  SET opened_at = COALESCE(opened_at, now()),
      open_count = CASE
        WHEN last_opened_at IS NULL OR now() - last_opened_at > interval '30 minutes'
        THEN open_count + 1
        ELSE open_count
      END,
      last_opened_at = now()
  WHERE id = p_message_id;
$function$;