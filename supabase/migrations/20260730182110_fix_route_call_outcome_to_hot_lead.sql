CREATE OR REPLACE FUNCTION public.route_call_outcome_to_hot_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_credits int;
  v_hot_lead_id uuid;
  v_charged boolean := false;
begin
  if new.call_outcome = 'meeting_agreed'
     and (old.call_outcome is null or old.call_outcome <> 'meeting_agreed') then

    -- hot_leads has a UNIQUE constraint on prospect_id. Without this guard a
    -- prospect who already became a hot lead via an email reply would raise a
    -- duplicate key error, which aborts the whole UPDATE and loses the call
    -- outcome the user just logged.
    if exists (select 1 from hot_leads where prospect_id = new.id) then
      return new;
    end if;

    select credits_remaining into v_credits
    from billing_profiles where client_id = new.client_id;

    v_charged := coalesce(v_credits, 0) > 0;

    insert into hot_leads (prospect_id, client_id, campaign_id, ai_summary,
                           suggested_action, status, credit_deducted, routed_at)
    values (new.id, new.client_id, new.campaign_id,
            'Called this business directly and they agreed to meet.',
            'Follow up to schedule the meeting.',
            'new', v_charged, now())
    returning id into v_hot_lead_id;

    -- WF6 deducts credits explicitly in the workflow; there is no trigger on
    -- hot_leads doing it. So a hot lead created here must charge the credit
    -- itself, or it would be free while reply-sourced leads are billed.
    if v_charged then
      insert into credit_transactions (client_id, amount, type, reference_id, description)
      values (new.client_id, -1, 'hot_lead_deduction', v_hot_lead_id,
              'Hot lead routed: ' || coalesce(new.business_name, 'unknown') || ' (phone call, meeting agreed)');

      update billing_profiles
      set credits_remaining = credits_remaining - 1
      where client_id = new.client_id;
    end if;
  end if;
  return new;
end;
$function$;