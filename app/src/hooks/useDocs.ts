import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export const DOCS_KEY = ['docs-articles'] as const;

export interface DocsArticle {
  id: string;
  slug: string;
  category: string;
  audience: 'client' | 'admin' | 'both' | 'internal';
  title: string;
  summary: string;
  body_md: string;
  related_slugs: string[];
  order_index: number;
  status: 'draft' | 'published';
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchDocsArticles(): Promise<DocsArticle[]> {
  // RLS does the real access control here (published + audience-scoped for
  // clients, everything for admins) — this query has no role/status filter
  // of its own, so the sidebar can never show something the API wouldn't
  // actually return.
  const { data, error } = await supabase
    .from('docs_articles')
    .select('id, slug, category, audience, title, summary, body_md, related_slugs, order_index, status, version, updated_by, created_at, updated_at')
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocsArticle[];
}

export function useDocsArticles() {
  const { data: rows = [], isLoading: loading, error } = useQuery({
    queryKey: DOCS_KEY,
    queryFn: fetchDocsArticles,
    staleTime: 2 * 60 * 1000,
  });

  // Categories in first-appearance order — since rows are already sorted by
  // order_index and every seeded category's lowest order_index matches its
  // intended sidebar position, this needs no separate hardcoded ordering.
  const categories = useMemo(() => {
    const seen = new Map<string, DocsArticle[]>();
    for (const row of rows) {
      if (!seen.has(row.category)) seen.set(row.category, []);
      seen.get(row.category)!.push(row);
    }
    return Array.from(seen.entries()).map(([category, articles]) => ({ category, articles }));
  }, [rows]);

  return {
    rows,
    categories,
    loading,
    error: (error as Error)?.message ?? null,
    reload: () => queryClient.invalidateQueries({ queryKey: DOCS_KEY }),
  };
}

export interface DocsArticleInput {
  slug: string;
  category: string;
  audience: DocsArticle['audience'];
  title: string;
  summary: string;
  body_md: string;
  status: 'draft' | 'published';
  order_index: number;
}

// Fire-and-forget: re-embedding is a background enhancement for search, not
// part of the save itself — a failure here (e.g. GEMINI_API_KEY not yet
// configured) must never make the article save appear to fail. Admins also
// have the "Re-embed all" bulk action in the Docs admin screen as a backstop.
function reembedInBackground(articleId: string) {
  supabase.functions.invoke('embed-docs-article', { body: { article_id: articleId } })
    .catch(() => { /* best-effort */ });
}

export async function createDocsArticle(input: DocsArticleInput) {
  const { data, error } = await supabase.from('docs_articles').insert(input).select('id').single();
  if (!error) {
    queryClient.invalidateQueries({ queryKey: DOCS_KEY });
    if (data) reembedInBackground(data.id);
  }
  return { error: error?.message ?? null };
}

export type DocsArticleUpdate = Partial<Omit<DocsArticleInput, 'slug'>>;

export async function updateDocsArticle(id: string, patch: DocsArticleUpdate) {
  // version / updated_at / updated_by are handled by the docs_articles_bump_version
  // trigger — never set from here, so no write path can skip that bookkeeping.
  const { error } = await supabase.from('docs_articles').update(patch).eq('id', id);
  if (!error) {
    queryClient.invalidateQueries({ queryKey: DOCS_KEY });
    if (patch.body_md !== undefined) reembedInBackground(id);
  }
  return { error: error?.message ?? null };
}

export async function reembedAllArticles(articleIds: string[]): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  for (const id of articleIds) {
    const { error } = await supabase.functions.invoke('embed-docs-article', { body: { article_id: id } });
    if (error) failed += 1; else succeeded += 1;
  }
  return { succeeded, failed };
}
