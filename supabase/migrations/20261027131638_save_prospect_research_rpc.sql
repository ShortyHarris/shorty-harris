create or replace function public.save_prospect_research(p_prospect_id uuid, p_research jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_site text;
begin
  if not public.is_trusted_backend() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  v_site := nullif(btrim(coalesce(p_research->>'website','')), '');
  update public.prospects
     set enrichment = coalesce(enrichment, '{}'::jsonb) || jsonb_build_object('research', p_research),
         website = case when website is null and v_site is not null and p_research->>'match_confidence' = 'high' then v_site else website end
   where id = p_prospect_id;
  return jsonb_build_object('ok', found);
end $$;
revoke all on function public.save_prospect_research(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_prospect_research(uuid, jsonb) to service_role