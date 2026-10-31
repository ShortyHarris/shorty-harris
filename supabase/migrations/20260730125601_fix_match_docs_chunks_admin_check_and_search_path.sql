-- Trust the server-side admin check, not a caller-supplied boolean.
-- Parameter kept in the signature so existing callers do not break.
CREATE OR REPLACE FUNCTION public.match_docs_chunks(
  query_embedding vector,
  caller_is_admin boolean,
  match_count integer DEFAULT 5
)
RETURNS TABLE(chunk_text text, article_title text, article_slug text, similarity double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    de.chunk_text,
    da.title as article_title,
    da.slug as article_slug,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.docs_embeddings de
  join public.docs_articles da on da.id = de.article_id
  where da.status = 'published'
    and (public.is_admin() or da.audience in ('client', 'both'))
  order by de.embedding <=> query_embedding
  limit match_count;
$function$;

-- Pin search_path on the open tracker (introduced when the debounce was added).
CREATE OR REPLACE FUNCTION public.record_email_open(p_message_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE messages
  SET opened_at = COALESCE(opened_at, now()),
      open_count = CASE
        WHEN last_opened_at IS NULL OR now() - last_opened_at > interval '30 minutes'
        THEN open_count + 1
        ELSE open_count
      END,
      last_opened_at = now()
  WHERE id = p_message_id;
$function$;