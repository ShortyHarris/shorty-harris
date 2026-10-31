create or replace view admin_notification_recipients as
select p.id, p.full_name, u.email
from profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';

grant select on admin_notification_recipients to authenticated, anon, service_role;