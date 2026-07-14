import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export type BlogCategory = 'family_business' | 'small_business' | 'business_development_rural' | 'general';
export type BlogStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'rejected';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: BlogCategory;
  body_md: string;
  excerpt: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  meta_description: string | null;
  target_keywords: string[];
  status: BlogStatus;
  author: string | null;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  published_at: string | null;
}

export interface LinkedPost {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  anchor_text: string | null;
}

export const BLOG_KEYS = {
  pending: ['blog-posts', 'pending'] as const,
  published: ['blog-posts', 'published'] as const,
  links: (postId: string) => ['blog-posts', 'links', postId] as const,
};

async function fetchPosts(status: BlogStatus | BlogStatus[]): Promise<BlogPost[]> {
  let q = supabase
    .from('blog_posts')
    .select(
      `id, title, slug, category, body_md, excerpt, cover_image_url,
       seo_title, meta_description, target_keywords, status, author,
       rejection_reason, created_at, approved_at, published_at`
    );
  q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    target_keywords: (row.target_keywords as string[] | null) ?? [],
  })) as BlogPost[];
}

// blog_link_graph rows get written as soon as WF12 plans the interlinks —
// before the source post is even approved — so this is queried independently
// of post status, matching what the dashboard needs to preview at review time.
export async function fetchLinkedPosts(postId: string): Promise<LinkedPost[]> {
  const { data: links, error } = await supabase
    .from('blog_link_graph')
    .select('target_post_id, anchor_text')
    .eq('source_post_id', postId);
  if (error) throw new Error(error.message);
  if (!links || links.length === 0) return [];

  const targetIds = links.map((l: { target_post_id: string }) => l.target_post_id);
  const { data: targets } = await supabase
    .from('blog_posts')
    .select('id, title, slug, cover_image_url')
    .in('id', targetIds);

  const byId = new Map((targets ?? []).map((t: Record<string, unknown>) => [t.id, t]));
  return links.map((l: { target_post_id: string; anchor_text: string | null }) => {
    const t = byId.get(l.target_post_id) as { id: string; title: string; slug: string; cover_image_url: string | null } | undefined;
    return {
      id: l.target_post_id,
      title: t?.title ?? 'Unknown post',
      slug: t?.slug ?? '',
      cover_image_url: t?.cover_image_url ?? null,
      anchor_text: l.anchor_text,
    };
  });
}

export function useBlogQueue() {
  const {
    data: pending = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: BLOG_KEYS.pending,
    queryFn: () => fetchPosts('pending_approval'),
    staleTime: Infinity,
  });

  // Realtime invalidation for the `blog_posts` table is handled once,
  // centrally, by useRealtimeSync() in AdminLayout — not here. A second
  // per-hook channel subscription with a fixed name breaks the moment this
  // hook is mounted more than once at a time (e.g. the sidebar badge + the
  // page itself).

  const approveAndPublish = useCallback(async (
    id: string,
    edits?: Partial<Pick<BlogPost, 'title' | 'body_md' | 'excerpt' | 'seo_title' | 'meta_description'>>,
  ) => {
    queryClient.setQueryData<BlogPost[]>(BLOG_KEYS.pending, (prev = []) =>
      prev.filter((p) => p.id !== id)
    );

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('blog_posts')
      .update({ ...edits, status: 'published', approved_at: now, published_at: now })
      .eq('id', id);

    if (error) {
      queryClient.invalidateQueries({ queryKey: BLOG_KEYS.pending });
      throw new Error(error.message);
    }

    queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
  }, []);

  const reject = useCallback(async (id: string, reason: string) => {
    queryClient.setQueryData<BlogPost[]>(BLOG_KEYS.pending, (prev = []) =>
      prev.filter((p) => p.id !== id)
    );

    const { error } = await supabase
      .from('blog_posts')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', id);

    if (error) {
      queryClient.invalidateQueries({ queryKey: BLOG_KEYS.pending });
      throw new Error(error.message);
    }
  }, []);

  // "Regenerate" is intentionally not an AI call from the frontend — WF12
  // picks up the gap on its next scheduled run once the row is gone.
  const deleteForRegeneration = useCallback(async (id: string) => {
    queryClient.setQueryData<BlogPost[]>(BLOG_KEYS.pending, (prev = []) =>
      prev.filter((p) => p.id !== id)
    );

    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: BLOG_KEYS.pending });
      throw new Error(error.message);
    }
  }, []);

  return {
    pending,
    loading,
    error: (error as Error)?.message ?? null,
    approveAndPublish,
    reject,
    deleteForRegeneration,
    reload: () => queryClient.invalidateQueries({ queryKey: BLOG_KEYS.pending }),
  };
}

export function usePublishedBlogPosts() {
  const { data: posts = [], isLoading: loading, error } = useQuery({
    queryKey: BLOG_KEYS.published,
    queryFn: () => fetchPosts('published'),
    staleTime: 60 * 1000,
  });

  const saveEdits = useCallback(async (
    id: string,
    edits: Partial<Pick<BlogPost, 'title' | 'body_md' | 'excerpt' | 'seo_title' | 'meta_description'>>,
  ) => {
    const { error } = await supabase.from('blog_posts').update(edits).eq('id', id);
    if (error) throw new Error(error.message);
    queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
  }, []);

  return {
    posts,
    loading,
    error: (error as Error)?.message ?? null,
    saveEdits,
    reload: () => queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published }),
  };
}

// Public post detail page — RLS only allows reading status = 'published'
// rows anyway, so this is safe to call with the anon key straight from the
// browser like the rest of the public site.
async function fetchPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      `id, title, slug, category, body_md, excerpt, cover_image_url,
       seo_title, meta_description, target_keywords, status, author,
       rejection_reason, created_at, approved_at, published_at`
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    ...data,
    target_keywords: (data.target_keywords as string[] | null) ?? [],
  } as BlogPost;
}

export function useBlogPost(slug: string) {
  const { data: post, isLoading: loading, error } = useQuery({
    queryKey: ['blog-posts', 'by-slug', slug],
    queryFn: () => fetchPublishedPostBySlug(slug),
    enabled: !!slug,
    staleTime: 60 * 1000,
  });

  return {
    post: post ?? null,
    loading,
    error: (error as Error)?.message ?? null,
  };
}
