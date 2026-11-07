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