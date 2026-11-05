-- send_pacing reports what the "How sending works" details need to say when the next
-- email goes: the last send time, "now", and whether the 9-5 window applies.
-- Times are on the sandbox clock for a sandbox (offset is zero for real clients), so
-- they match the rest of the response.
--
-- Applied live as 20261105060000; statements exactly as applied.

do $mig$
declare d text := pg_get_functiondef('public.send_pacing'::regproc);
  a text := '    ''time_zone'', v_tz,';
begin
  if position(a in d) = 0 then raise exception 'send_pacing: anchor not found'; end if;
  if position('last_sent_at' in d) > 0 then raise exception 'already applied'; end if;
  d := replace(d, a, a || chr(10) ||
    '    ''now'', now() + v_clk,' || chr(10) ||
    '    ''window_applies'', not v_fast,' || chr(10) ||
    '    ''last_sent_at'', (select max(m.sent_at) + v_clk from public.messages m' || chr(10) ||
    '                      where m.client_id = p_client_id and m.send_status = ''sent''),');
  execute d;
end $mig$;
