alter table ab_metrics drop constraint ab_metrics_metric_check;
alter table ab_metrics add constraint ab_metrics_metric_check
  check (metric = ANY (ARRAY['visit'::text, 'conversion'::text, 'reply'::text, 'hot_lead'::text, 'revenue_cents'::text, 'sent'::text]));