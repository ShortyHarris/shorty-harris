
-- Backfill: anyone who has actually signed in but was never stamped.
update public.profiles p
set activated_at = u.last_sign_in_at
from auth.users u
where u.id = p.id and p.activated_at is null and u.last_sign_in_at is not null;

-- Server-side stamp on first sign-in, so it no longer depends on the frontend.
create or replace function public.stamp_profile_activated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is not null and (old.last_sign_in_at is distinct from new.last_sign_in_at) then
    update public.profiles set activated_at = new.last_sign_in_at
    where id = new.id and activated_at is null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_stamp_profile_activated on auth.users;
create trigger trg_stamp_profile_activated
after update of last_sign_in_at on auth.users
for each row execute function public.stamp_profile_activated();
