create or replace function public.bump_research_attempt(p_prospect_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_attempts int;
begin
  if not public.is_trusted_backend() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  select coalesce((enrichment->'research'->>'attempts')::int, 1) + 1
    into v_attempts from public.prospects where id = p_prospect_id;
  if v_attempts is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update public.prospects
     set enrichment = jsonb_set(coalesce(enrichment, '{}'::jsonb), '{research,attempts}', to_jsonb(v_attempts), true)
   where id = p_prospect_id;
  return jsonb_build_object('ok', true, 'attempts', v_attempts);
end $$;

revoke all on function public.bump_research_attempt(uuid) from public, anon, authenticated;
grant execute on function public.bump_research_attempt(uuid) to service_role;

comment on function public.bump_research_attempt(uuid) is 'Counts research attempts so the retry sweep gives up after a few tries instead of re-running a hopeless prospect forever.'