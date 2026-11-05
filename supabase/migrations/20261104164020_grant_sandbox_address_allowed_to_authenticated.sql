-- sendable_messages (security_invoker) calls sandbox_address_allowed, so every
-- client and admin reading it through approved_queue needs EXECUTE. Without it
-- the Approvals page failed for all clients with "permission denied for
-- function sandbox_address_allowed". The function is SECURITY DEFINER, read-only,
-- and returns only whether an address may be mailed for a client.
grant execute on function public.sandbox_address_allowed(uuid, text) to authenticated;
