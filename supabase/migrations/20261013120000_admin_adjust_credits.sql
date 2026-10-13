-- Admin credit adjustment: updates billing_profiles.credits_remaining and logs a
-- credit_transactions 'adjustment' row in one transaction. Admin only.
create or replace function public.admin_adjust_credits(
  p_client_id uuid,
  p_amount integer,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  if p_amount is null or p_amount = 0 then
    return jsonb_build_object('ok', false, 'error', 'amount_required');
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;

  -- Lock the row (or create it) so concurrent adjustments serialise.
  insert into public.billing_profiles (client_id, credits_remaining, sms_credits_remaining)
  values (p_client_id, 0, 0)
  on conflict (client_id) do nothing;

  select credits_remaining into v_balance
  from public.billing_profiles where client_id = p_client_id for update;

  if v_balance + p_amount < 0 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'balance', v_balance);
  end if;

  update public.billing_profiles
     set credits_remaining = credits_remaining + p_amount, updated_at = now()
   where client_id = p_client_id
   returning credits_remaining into v_balance;

  insert into public.credit_transactions (client_id, amount, type, description)
  values (p_client_id, p_amount, 'adjustment', coalesce(nullif(btrim(p_note), ''), 'Admin adjustment'));

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

revoke all on function public.admin_adjust_credits(uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_credits(uuid, integer, text) to authenticated;
