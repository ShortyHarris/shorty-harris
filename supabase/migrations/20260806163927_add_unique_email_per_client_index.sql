create unique index if not exists prospects_client_email_unique
on prospects (client_id, lower(trim(email)))
where email is not null and email <> '';