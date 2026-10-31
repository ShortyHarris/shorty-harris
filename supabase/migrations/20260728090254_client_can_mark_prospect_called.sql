-- Clients can update their own prospects, but only to flip pipeline_status to
-- 'called' (marking a manual phone follow-up) — not to arbitrary statuses like
-- 'won' or 'hot_lead', which stay admin/system-controlled.
create policy client_mark_called on prospects
  for update
  using (client_id = current_client_id())
  with check (client_id = current_client_id() and pipeline_status = 'called');