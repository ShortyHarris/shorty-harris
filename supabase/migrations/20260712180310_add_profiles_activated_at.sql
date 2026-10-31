alter table public.profiles add column if not exists activated_at timestamptz;
update public.profiles p
set activated_at = u.last_sign_in_at
from auth.users u
where u.id = p.id
  and u.last_sign_in_at is not null
  and p.activated_at is null;