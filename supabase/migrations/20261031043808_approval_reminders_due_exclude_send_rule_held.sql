-- WF18 emails each client "N emails are waiting for your approval", and it reads
-- this view rather than querying anything itself. The view counted every
-- pending draft, including ones held by the generic-mailbox / freemail send
-- rules, which a client can no longer see or approve. That would send a client a
-- reminder about drafts that do not exist from their side of the screen.
--
-- Excluding them here keeps the reminder count equal to counts.pending as the
-- client sees it. Today no client has a held pending draft, so nothing changes
-- yet: this closes a latent divergence rather than fixing a live one.
-- Only the pending CTE changes. Columns, order and types are unchanged, so WF18
-- needs no edit.
create or replace view public.approval_reminders_due as
 WITH local_now AS (
         SELECT (now() AT TIME ZONE 'America/Denver'::text) AS t
        ), pending AS (
         SELECT m.client_id,
            count(DISTINCT m.prospect_id)::integer AS prospects,
            min(m.created_at) AS oldest
           FROM messages m
             JOIN prospects p ON p.id = m.prospect_id
          WHERE m.approval_status = 'pending'::text AND m.send_status = 'not_sent'::text AND COALESCE(p.is_sandbox, false) = false AND (p.pipeline_status <> ALL (ARRAY['bounced'::text, 'lost'::text, 'replied'::text, 'hot_lead'::text, 'won'::text, 'called'::text])) AND NOT (EXISTS ( SELECT 1
                   FROM do_not_contact d
                  WHERE lower(d.email) = lower(p.email)))
             AND NOT public.is_send_rule_held(p.email, m.campaign_id, m.client_id)
          GROUP BY m.client_id
        )
 SELECT c.id AS client_id,
    c.business_name,
    c.contact_name,
    btrim(c.contact_email) AS contact_email,
    pe.prospects AS pending_prospects,
    GREATEST(0::numeric, floor(EXTRACT(epoch FROM now() - pe.oldest) / 86400::numeric))::integer AS days_waiting,
    NOT (EXISTS ( SELECT 1
           FROM approval_reminder_log l
          WHERE l.client_id = c.id AND l.status = 'sent'::text)) AS is_first,
    ln.t::date AS reminder_date
   FROM pending pe
     JOIN clients c ON c.id = pe.client_id
     CROSS JOIN local_now ln
  WHERE c.contact_email IS NOT NULL AND btrim(c.contact_email) <> ''::text AND COALESCE(c.status, 'active'::text) = 'active'::text AND EXTRACT(isodow FROM ln.t) >= 1::numeric AND EXTRACT(isodow FROM ln.t) <= 5::numeric AND EXTRACT(hour FROM ln.t) >= 8::numeric AND EXTRACT(hour FROM ln.t) <= 16::numeric AND NOT (EXISTS ( SELECT 1
           FROM approval_reminder_log l
          WHERE l.client_id = c.id AND l.reminder_date = ln.t::date AND (l.status = ANY (ARRAY['pending'::text, 'sent'::text]))))