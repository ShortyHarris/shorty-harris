CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_initial_msg_per_prospect
ON messages (prospect_id)
WHERE message_type = 'initial'
  AND approval_status = 'pending'
  AND send_status = 'not_sent';