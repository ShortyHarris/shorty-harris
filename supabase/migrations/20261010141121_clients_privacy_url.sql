alter table public.clients add column if not exists privacy_url text;
comment on column public.clients.privacy_url is 'Optional link to the sender privacy notice. When set, it is added as a line in the email footer.';
update public.clients set privacy_url = 'https://www.tutel.cz/privacy' where id = '40d3f053-dc07-49d6-a3c7-3ecba00f7c88';
update public.messages set body = body || E'\nOchrana osobních údajů: https://www.tutel.cz/privacy'
 where client_id = '40d3f053-dc07-49d6-a3c7-3ecba00f7c88' and approval_status = 'pending' and send_status = 'not_sent'
   and body !~ 'tutel\.cz/privacy';