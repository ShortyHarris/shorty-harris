-- The send-claim functions are backend-only (regression-test plan issue 6).
-- claim_message_for_send and release_message_claim were executable by anon (the public API
-- key): with a message id, anyone could hold an email or, by releasing it three times, mark
-- it failed. WF3 now calls them through WF3a with the n8n Supabase (service role) credential.
revoke all on function public.claim_message_for_send(uuid) from public, anon, authenticated;
revoke all on function public.release_message_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_message_for_send(uuid) to service_role;
grant execute on function public.release_message_claim(uuid, text) to service_role;