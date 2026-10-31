
create policy "authenticated admin read all posts" on blog_posts
  for select
  to authenticated
  using (true);
