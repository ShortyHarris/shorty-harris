create extension if not exists vector;

create table public.docs_embeddings (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.docs_articles(id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(768),
  created_at timestamptz not null default now(),
  unique (article_id, chunk_index)
);

create index docs_embeddings_article_id_idx on public.docs_embeddings(article_id);

create index docs_embeddings_embedding_idx
  on public.docs_embeddings
  using hnsw (embedding vector_cosine_ops);

alter table public.docs_embeddings enable row level security;

-- Embeddings/chunk text are only ever read server-side by the docs-search
-- edge function (service role), which does its own audience filtering by
-- joining back to docs_articles before ranking. No client ever queries this
-- table directly, so the only client-facing policy needed is admin access
-- for visibility/debugging.
create policy admin_all_docs_embeddings
  on public.docs_embeddings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
