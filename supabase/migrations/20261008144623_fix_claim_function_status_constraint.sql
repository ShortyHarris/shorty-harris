create or replace function public.claim_message_for_send(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  update messages
     set send_claimed_at = now(), updated_at = now()
   where id = p_message_id
     and send_claimed_at is null
     and send_status <> 'sent'
  returning id into v_id;
  return jsonb_build_object('claimed', v_id is not null);
end;
$$;

create or replace function public.release_message_claim(p_message_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update messages set send_claimed_at = null, send_status = 'failed', updated_at = now()
   where id = p_message_id and send_status <> 'sent';
$$;