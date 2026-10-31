create or replace view public.sendable_messages as
 SELECT m.id, m.prospect_id, m.campaign_id, m.client_id, m.channel, m.subject, m.body, m.message_type,
    m.approval_status, m.approved_by, m.approved_at, m.send_status, m.scheduled_for, m.sent_at,
    m.gmail_message_id, m.gmail_thread_id, m.created_at, m.updated_at, m.opened_at, m.open_count,
    m.last_opened_at, m.send_claimed_at
   FROM messages m
     JOIN prospects p ON p.id = m.prospect_id
     LEFT JOIN campaigns c ON c.id = m.campaign_id
     LEFT JOIN clients cl ON cl.id = m.client_id
  WHERE m.approval_status = 'approved'::text AND m.send_status = 'not_sent'::text
    AND (p.pipeline_status <> ALL (ARRAY['replied'::text, 'hot_lead'::text, 'won'::text, 'lost'::text, 'called'::text, 'bounced'::text]))
    AND p.sequence_paused = false
    AND (COALESCE(c.status, 'active'::text) <> ALL (ARRAY['paused'::text, 'cancelled'::text, 'draft'::text]))
    AND NOT (EXISTS ( SELECT 1 FROM do_not_contact d WHERE lower(d.email) = lower(p.email)))
    AND NOT ((COALESCE(c.language, ''::text) = 'Czech'::text OR is_eu_country(COALESCE(c.country, cl.country)))
             AND (is_generic_mailbox(p.email) OR is_freemail(p.email)))
    AND NOT (EXISTS ( SELECT 1 FROM country_send_holds h
                      WHERE h.cleared = false AND h.country = upper(COALESCE(c.country, cl.country, ''))))
    AND (m.message_type = 'initial'::text OR (EXISTS ( SELECT 1
           FROM messages prev
          WHERE prev.prospect_id = m.prospect_id AND prev.send_status = 'sent'::text AND prev.message_type =
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 'initial'::text
                    WHEN 'follow_up_d7'::text THEN 'follow_up_d3'::text
                    WHEN 'follow_up_d14'::text THEN 'follow_up_d7'::text
                    ELSE NULL::text
                END AND add_business_days(prev.sent_at,
                CASE m.message_type
                    WHEN 'follow_up_d3'::text THEN 3
                    WHEN 'follow_up_d7'::text THEN 5
                    ELSE 7
                END) <= now())));