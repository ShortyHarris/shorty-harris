
insert into public.clients (
  id, business_name, business_type, location, contact_email, contact_phone,
  status, notification_channel, website_url, monthly_prospect_limit, max_campaigns,
  representative_name, created_at, updated_at
) values (
  gen_random_uuid(), 'Riverside Grove Landscaping', 'Landscaping & Grounds Care', 'Denver, CO',
  'demo.riverside@shortyharris-test.com', '+1-303-555-0142',
  'active', 'whatsapp', 'https://riversidegrove-demo.test', 500, 3,
  'Dana Whitfield', now(), now()
);
