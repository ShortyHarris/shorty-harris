-- Pipeline-only functions: service_role (n8n) only
revoke execute on function public.import_raw_scrapes(uuid) from public, anon, authenticated;
revoke execute on function public.claim_message_for_send(uuid) from public, anon, authenticated;
revoke execute on function public.release_message_claim(uuid) from public, anon, authenticated;
revoke execute on function public.presend_gate(uuid) from public, anon, authenticated;
revoke execute on function public.run_compliance_check(uuid) from public, anon, authenticated;
revoke execute on function public.get_duplicate_send_alerts() from public, anon, authenticated;
grant execute on function public.import_raw_scrapes(uuid) to service_role;
grant execute on function public.claim_message_for_send(uuid) to service_role;
grant execute on function public.release_message_claim(uuid) to service_role;
grant execute on function public.presend_gate(uuid) to service_role;
grant execute on function public.run_compliance_check(uuid) to service_role;
grant execute on function public.get_duplicate_send_alerts() to service_role;

-- Possibly used by signed-in app: remove anonymous access only
revoke execute on function public.build_client_icp(uuid) from public, anon;
revoke execute on function public.resolve_sender_address(uuid) from public, anon;
grant execute on function public.build_client_icp(uuid) to authenticated, service_role;
grant execute on function public.resolve_sender_address(uuid) to authenticated, service_role;

-- Views: enforce caller's RLS instead of creator's
alter view public.optout_stats set (security_invoker = true);
alter view public.duplicate_send_alerts set (security_invoker = true);
revoke select on public.optout_stats, public.duplicate_send_alerts from anon;