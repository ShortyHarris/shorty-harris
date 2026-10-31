
insert into storage.buckets (id, name, public)
values ('blog-covers', 'blog-covers', true)
on conflict (id) do nothing;

-- public read, service-role write (dashboard/n8n use service key so no insert policy needed for them)
create policy "public read blog covers"
on storage.objects for select
using (bucket_id = 'blog-covers');
