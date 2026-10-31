CREATE OR REPLACE VIEW public.messages_with_sender AS
SELECT m.*,
  cec.email_address AS sender_email,
  cec.status AS sender_status,
  c.business_name AS client_name
FROM messages m
LEFT JOIN client_email_credentials cec ON cec.client_id = m.client_id
LEFT JOIN clients c ON c.id = m.client_id;