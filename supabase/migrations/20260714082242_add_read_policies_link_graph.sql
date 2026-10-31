
create policy "authenticated admin read link graph" on blog_link_graph
  for select
  to authenticated
  using (true);

create policy "public read link graph for published posts" on blog_link_graph
  for select
  to anon
  using (
    exists (
      select 1 from blog_posts
      where blog_posts.id = blog_link_graph.source_post_id
      and blog_posts.status = 'published'
    )
  );
