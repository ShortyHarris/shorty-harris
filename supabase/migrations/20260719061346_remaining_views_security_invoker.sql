alter view public.optout_stats set (security_invoker = true);
alter view public.optout_list set (security_invoker = true);
alter view public.messages_with_sender set (security_invoker = true);