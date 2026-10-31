create policy client_own_notifications_update on public.notifications
  for update
  using (client_id = current_client_id())
  with check (client_id = current_client_id());