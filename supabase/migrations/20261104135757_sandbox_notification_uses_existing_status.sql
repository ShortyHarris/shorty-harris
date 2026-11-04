-- notifications.status already has a 'sandbox_logged' value, which is the
-- convention this codebase settled on. Use it rather than adding a second
-- word for the same idea. WF14 only drains 'pending', so the row is visible
-- to a tester and nothing dials out.
create or replace function public.hold_sandbox_notification()
returns trigger
language plpgsql
as $$
declare v_sandbox boolean;
begin
  select is_sandbox into v_sandbox from clients where id = new.client_id;
  if coalesce(v_sandbox, false) and new.status = 'pending' then
    new.status := 'sandbox_logged';
  end if;
  return new;
end;
$$;;
