-- Audience filtering happens INSIDE this function, before ranking/limiting —
-- a client-role caller can never receive an internal-only chunk even in the
-- unranked candidate set, let alone in the final top-N result.
create or replace function public.match_docs_chunks(
  query_embedding vector(768),
  caller_is_admin boolean,
  match_count int default 5
)
returns table (
  chunk_text text,
  article_title text,
  article_slug text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    de.chunk_text,
    da.title as article_title,
    da.slug as article_slug,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.docs_embeddings de
  join public.docs_articles da on da.id = de.article_id
  where da.status = 'published'
    and (caller_is_admin or da.audience in ('client', 'both'))
  order by de.embedding <=> query_embedding
  limit match_count;
$$;
