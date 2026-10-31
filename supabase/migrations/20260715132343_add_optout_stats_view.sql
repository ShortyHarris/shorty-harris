-- View for admin dashboard opt-out / unsubscribe stats
CREATE OR REPLACE VIEW public.optout_stats AS
WITH dnc AS (
  SELECT
    d.email,
    d.reason,
    d.created_at,
    d.source_prospect_id,
    p.business_name AS prospect_business_name,
    p.client_id,
    p.campaign_id
  FROM do_not_contact d
  LEFT JOIN prospects p ON p.id = d.source_prospect_id
),
by_client AS (
  SELECT
    client_id,
    count(*) AS optout_count
  FROM dnc
  WHERE client_id IS NOT NULL
  GROUP BY client_id
),
stop_replies AS (
  SELECT count(*) AS total
  FROM replies
  WHERE intent = 'stop'
),
not_interested_replies AS (
  SELECT count(*) AS total
  FROM replies
  WHERE intent = 'not_interested'
),
totals AS (
  SELECT
    (SELECT count(*) FROM do_not_contact) AS total_optouts,
    (SELECT total FROM stop_replies) AS stop_replies,
    (SELECT total FROM not_interested_replies) AS not_interested_replies,
    (SELECT count(*) FROM do_not_contact WHERE created_at >= now() - interval '7 days') AS optouts_last_7_days,
    (SELECT count(*) FROM do_not_contact WHERE created_at >= now() - interval '30 days') AS optouts_last_30_days
)
SELECT * FROM totals;

-- Detailed list view for drilling down
CREATE OR REPLACE VIEW public.optout_list AS
SELECT
  d.id,
  d.email,
  d.reason,
  d.created_at,
  p.business_name,
  p.client_id,
  p.campaign_id,
  c.business_name AS client_name,
  camp.name AS campaign_name
FROM do_not_contact d
LEFT JOIN prospects p ON p.id = d.source_prospect_id
LEFT JOIN clients c ON c.id = p.client_id
LEFT JOIN campaigns camp ON camp.id = p.campaign_id
ORDER BY d.created_at DESC;