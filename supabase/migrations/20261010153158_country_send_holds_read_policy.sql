create policy "authenticated can read country holds"
  on public.country_send_holds for select to authenticated using (true);