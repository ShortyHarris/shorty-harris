grant execute on function public.import_raw_scrapes(uuid) to anon, authenticated;
grant execute on function public.claim_message_for_send(uuid) to anon, authenticated;
grant execute on function public.release_message_claim(uuid) to anon, authenticated;
grant execute on function public.presend_gate(uuid) to anon, authenticated;
grant execute on function public.run_compliance_check(uuid) to anon, authenticated;
grant execute on function public.get_duplicate_send_alerts() to anon, authenticated;