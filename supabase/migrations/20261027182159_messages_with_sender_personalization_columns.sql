create or replace view public.messages_with_sender as
 SELECT m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject, m.body, m.message_type,
    m.approval_status, m.approved_by, m.approved_at, m.send_status, m.scheduled_for, m.sent_at,
    m.gmail_message_id, m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at, m.open_count,
    cec.email_address AS sender_email, cec.status AS sender_status, c.business_name AS client_name,
    m.pending_since,
    m.angle, m.observation, m.observation_source_url
   FROM ((messages m
     LEFT JOIN client_email_credentials cec ON ((cec.client_id = m.client_id)))
     LEFT JOIN clients c ON ((c.id = m.client_id)))