
do $$
declare d text;
begin
  select pg_get_functiondef('public.build_client_icp(uuid)'::regprocedure) into d;
  if d not like '%can_manage_client%' then
    d := replace(d, E'begin\r\n  select * into v_client from public.clients where id = p_client_id;',
      E'begin\r\n  if not public.can_manage_client(p_client_id) then\r\n    return jsonb_build_object(''ok'', false, ''error'', ''not_permitted'');\r\n  end if;\r\n  select * into v_client from public.clients where id = p_client_id;');
    if d not like '%can_manage_client%' then raise exception 'patch did not apply'; end if;
    execute d;
  end if;
end $$;
