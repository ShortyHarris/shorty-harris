
do $$
declare
  cid uuid := '828dafcc-eab8-491c-abfb-fa9e4ba7a9b9';
  camp_id uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  p4 uuid := gen_random_uuid(); p5 uuid := gen_random_uuid(); p6 uuid := gen_random_uuid();
  p7 uuid := gen_random_uuid(); p8 uuid := gen_random_uuid();
  m1 uuid; m2 uuid; m6 uuid; m7 uuid;
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
begin
  -- Campaign
  insert into public.campaigns (id, client_id, name, description, status, channel, search_queries, target_locations, max_results, created_at, updated_at)
  values (camp_id, cid, 'HOA & Property Managers - Denver Metro', 'Outreach to HOAs and commercial property managers around Denver for recurring grounds contracts', 'active', 'email', array['HOA property management Denver','commercial landscaping bids Denver'], array['Denver, CO','Aurora, CO','Lakewood, CO'], 50, now() - interval '18 days', now() - interval '1 day');

  -- Prospects (mix of pipeline statuses)
  insert into public.prospects (id, campaign_id, client_id, business_name, contact_name, email, phone, category, location, website, pipeline_status, is_sandbox, created_at, updated_at) values
  (p1, camp_id, cid, 'Cherry Creek HOA Alliance', 'Marion Best', 'marion@cherrycreekhoa-demo.test', '+1-303-555-0111', 'HOA', 'Denver, CO', 'https://cherrycreekhoa-demo.test', 'hot_lead', true, now() - interval '15 days', now() - interval '2 days'),
  (p2, camp_id, cid, 'Lakewood Commons Property Group', 'Terrence Ojo', 'terrence@lakewoodcommons-demo.test', '+1-303-555-0122', 'Property Management', 'Lakewood, CO', 'https://lakewoodcommons-demo.test', 'hot_lead', true, now() - interval '14 days', now() - interval '1 day'),
  (p3, camp_id, cid, 'Aurora Ridge Apartments', 'Simone Farrow', 'simone@auroraridge-demo.test', '+1-303-555-0133', 'Residential Complex', 'Aurora, CO', 'https://auroraridge-demo.test', 'replied', true, now() - interval '13 days', now() - interval '3 days'),
  (p4, camp_id, cid, 'Golden Valley Office Park', 'Owen Castellan', 'owen@goldenvalleyop-demo.test', '+1-303-555-0144', 'Commercial', 'Golden, CO', 'https://goldenvalleyop-demo.test', 'contacted', true, now() - interval '12 days', now() - interval '5 days'),
  (p5, camp_id, cid, 'Highland Meadows HOA', 'Priya Nandakumar', 'priya@highlandmeadows-demo.test', '+1-303-555-0155', 'HOA', 'Denver, CO', 'https://highlandmeadows-demo.test', 'contacted', true, now() - interval '11 days', now() - interval '6 days'),
  (p6, camp_id, cid, 'Westfield Retail Plaza', 'Dominic Reyes', 'dominic@westfieldplaza-demo.test', '+1-303-555-0166', 'Retail', 'Denver, CO', 'https://westfieldplaza-demo.test', 'new', true, now() - interval '4 days', now() - interval '4 days'),
  (p7, camp_id, cid, 'Bear Creek Estates', 'Alina Vogt', 'alina@bearcreekestates-demo.test', '+1-303-555-0177', 'HOA', 'Lakewood, CO', 'https://bearcreekestates-demo.test', 'new', true, now() - interval '3 days', now() - interval '3 days'),
  (p8, camp_id, cid, 'Summit Corporate Campus', 'Ray Holloway', 'ray@summitcorporate-demo.test', '+1-303-555-0188', 'Commercial', 'Denver, CO', 'https://summitcorporate-demo.test', 'lost', true, now() - interval '16 days', now() - interval '8 days');

  -- Messages (initial sends, mix of opened/not opened, one follow-up)
  m1 := gen_random_uuid();
  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at, open_count, opened_at, last_opened_at, created_at, updated_at) values
  (m1, p1, camp_id, cid, 'email', 'Grounds care partner for Cherry Creek HOA?', 'Hi Marion, noticed Cherry Creek HOA manages several common areas around Denver. We handle recurring grounds maintenance for HOAs your size...', 'initial', 'approved', now() - interval '15 days', 'sent', now() - interval '15 days', 3, now() - interval '14 days', now() - interval '9 days', now() - interval '15 days', now() - interval '9 days');

  m2 := gen_random_uuid();
  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at, open_count, opened_at, last_opened_at, created_at, updated_at) values
  (m2, p2, camp_id, cid, 'email', 'Seasonal grounds contract - Lakewood Commons', 'Hi Terrence, Riverside Grove handles grounds care for several commercial properties in the Lakewood area...', 'initial', 'approved', now() - interval '14 days', 'sent', now() - interval '14 days', 5, now() - interval '13 days', now() - interval '2 days', now() - interval '14 days', now() - interval '2 days');

  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at, open_count, opened_at, last_opened_at, created_at, updated_at) values
  (gen_random_uuid(), p3, camp_id, cid, 'email', 'Landscaping for Aurora Ridge Apartments', 'Hi Simone, reaching out about ongoing grounds maintenance for Aurora Ridge...', 'initial', 'approved', now() - interval '13 days', 'sent', now() - interval '13 days', 2, now() - interval '12 days', now() - interval '10 days', now() - interval '13 days', now() - interval '10 days');

  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at, open_count, opened_at, last_opened_at, created_at, updated_at) values
  (gen_random_uuid(), p4, camp_id, cid, 'email', 'Grounds maintenance - Golden Valley Office Park', 'Hi Owen, we specialize in commercial grounds care across the Denver metro...', 'initial', 'approved', now() - interval '12 days', 'sent', now() - interval '12 days', 0, null, null, now() - interval '12 days', now() - interval '12 days');

  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at, open_count, opened_at, last_opened_at, created_at, updated_at) values
  (gen_random_uuid(), p5, camp_id, cid, 'email', 'Highland Meadows HOA - grounds care proposal', 'Hi Priya, following up on grounds care needs for Highland Meadows...', 'initial', 'approved', now() - interval '11 days', 'sent', now() - interval '11 days', 1, now() - interval '9 days', now() - interval '9 days', now() - interval '11 days', now() - interval '9 days');

  m6 := gen_random_uuid();
  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, send_status, created_at, updated_at) values
  (m6, p6, camp_id, cid, 'email', 'Grounds care for Westfield Retail Plaza', 'Hi Dominic, introducing Riverside Grove for your grounds maintenance needs...', 'initial', 'pending', 'not_sent', now() - interval '4 days', now() - interval '4 days');

  m7 := gen_random_uuid();
  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, send_status, created_at, updated_at) values
  (m7, p7, camp_id, cid, 'email', 'Bear Creek Estates - grounds partner', 'Hi Alina, reaching out about recurring landscaping for Bear Creek Estates...', 'initial', 'pending', 'not_sent', now() - interval '3 days', now() - interval '3 days');

  insert into public.messages (id, prospect_id, campaign_id, client_id, channel, subject, body, message_type, approval_status, approved_at, send_status, sent_at, open_count, created_at, updated_at) values
  (gen_random_uuid(), p8, camp_id, cid, 'email', 'Grounds care - Summit Corporate Campus', 'Hi Ray, reaching out about grounds maintenance for Summit Corporate Campus...', 'initial', 'approved', now() - interval '16 days', 'sent', now() - interval '16 days', 1, now() - interval '16 days', now() - interval '8 days');

  -- Replies
  insert into public.replies (id, prospect_id, message_id, client_id, body, received_at, intent, intent_confidence, classified_at, created_at) values
  (r1, p1, m1, cid, 'Hi Marion here - yes we''ve been looking for a new grounds contractor for next season. Can we set up a call this week?', now() - interval '9 days', 'interested', 0.94, now() - interval '9 days', now() - interval '9 days'),
  (r2, p2, m2, cid, 'This looks interesting, can you send over pricing for a 3-building complex?', now() - interval '2 days', 'interested', 0.88, now() - interval '2 days', now() - interval '2 days');

  insert into public.replies (id, prospect_id, message_id, client_id, body, received_at, intent, intent_confidence, classified_at, created_at) values
  (gen_random_uuid(), p3, null, cid, 'Not the right contact for this, please remove me.', now() - interval '10 days', 'wrong_person', 0.81, now() - interval '10 days', now() - interval '10 days');

  -- Hot leads (routed from the two interested replies)
  insert into public.hot_leads (id, prospect_id, client_id, campaign_id, reply_id, ai_summary, suggested_action, status, credit_deducted, routed_at, status_updated_at, created_at) values
  (gen_random_uuid(), p1, cid, camp_id, r1, 'Cherry Creek HOA Alliance is actively looking for a new grounds contractor for next season and wants a call this week.', 'Call within 24h to schedule a walkthrough', 'new', true, now() - interval '9 days', now() - interval '9 days', now() - interval '9 days'),
  (gen_random_uuid(), p2, cid, camp_id, r2, 'Lakewood Commons Property Group asked for pricing on a 3-building grounds contract.', 'Send pricing proposal for multi-building package', 'viewed', true, now() - interval '2 days', now() - interval '1 day', now() - interval '2 days');

  -- Credit transactions (purchase + two hot lead deductions)
  insert into public.credit_transactions (id, client_id, amount, type, description, created_at) values
  (gen_random_uuid(), cid, 10, 'purchase', 'Initial credit pack purchase', now() - interval '18 days'),
  (gen_random_uuid(), cid, -1, 'hot_lead_deduction', 'Hot lead: Cherry Creek HOA Alliance', now() - interval '9 days'),
  (gen_random_uuid(), cid, -1, 'hot_lead_deduction', 'Hot lead: Lakewood Commons Property Group', now() - interval '2 days');
end $$;
