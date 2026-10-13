import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export type BlogCategory = 'family_business' | 'small_business' | 'business_development_rural' | 'general';
export type BlogStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published' | 'rejected';

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
  scheduled_for: string | null;
}

export interface LinkedPost {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  anchor_text: string | null;
}

// Just what a public listing card renders - deliberately no body_md.
export type BlogCardPost = Pick<
  BlogPost,
  'id' | 'title' | 'slug' | 'excerpt' | 'cover_image_url' | 'category' | 'published_at'
>;
const BLOG_CARD_COLUMNS = 'id, title, slug, excerpt, cover_image_url, category, published_at';

export const BLOG_PAGE_SIZE = 9;
const PUBLIC_STALE_TIME = 5 * 60 * 1000;

export const BLOG_KEYS = {
  pending: ['blog-posts', 'pending'] as const,
  published: ['blog-posts', 'published'] as const,
  // Nested under `published` so the admin's existing invalidations of
  // BLOG_KEYS.published (prefix match) also refresh the public pages.
  publicPage: (category: BlogCategory | 'all', page: number) =>
    ['blog-posts', 'published', 'public', 'page', category, page] as const,
  publicCategories: ['blog-posts', 'published', 'public', 'categories'] as const,
  links: (postId: string) => ['blog-posts', 'links', postId] as const,
};

// Every public read goes through this: live means status = 'published' AND
// published_at has arrived. Applied explicitly rather than trusting RLS, so
// scheduled/draft rows can't leak even if a policy is loosened later.
// (Typed loosely on purpose: constraining Q to the Supabase builder's own
// method types trips TS2589 "excessively deep" on the generated types.)
interface Filterable {
  eq(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
}
function onlyLive<Q>(q: Q): Q {
  return (q as unknown as Filterable)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString()) as unknown as Q;
}

async function fetchPosts(status: BlogStatus | BlogStatus[]): Promise<BlogPost[]> {
  let q = supabase
    .from('blog_posts')
    .select(
      `id, title, slug, category, body_md, excerpt, cover_image_url,
       seo_title, meta_description, target_keywords, status, author,
       rejection_reason, created_at, approved_at, published_at, scheduled_for`
    );
  q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    target_keywords: (row.target_keywords as string[] | null) ?? [],
  })) as BlogPost[];
}

// blog_link_graph rows get written as soon as WF12 plans the interlinks -
// before the source post is even approved - so this is queried independently
// of post status, matching what the dashboard needs to preview at review time.
// The public post page passes { liveOnly: true } so "Keep reading" never
// links to a post that isn't live yet; links to non-live targets are dropped.
export async function fetchLinkedPosts(
  postId: string,
  { liveOnly = false }: { liveOnly?: boolean } = {},
): Promise<LinkedPost[]> {
  const { data: links, error } = await supabase
    .from('blog_link_graph')
    .select('target_post_id, anchor_text')
    .eq('source_post_id', postId);
  if (error) throw new Error(error.message);
  if (!links || links.length === 0) return [];

  const targetIds = links.map((l: { target_post_id: string }) => l.target_post_id);
  let targetsQuery = supabase
    .from('blog_posts')
    .select('id, title, slug, cover_image_url')
    .in('id', targetIds);
  if (liveOnly) targetsQuery = onlyLive(targetsQuery);
  const { data: targets } = await targetsQuery;

  const byId = new Map((targets ?? []).map((t: Record<string, unknown>) => [t.id, t]));
  const visibleLinks = liveOnly
    ? links.filter((l: { target_post_id: string }) => byId.has(l.target_post_id))
    : links;
  return visibleLinks.map((l: { target_post_id: string; anchor_text: string | null }) => {
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
    isFetching,
    dataUpdatedAt,
    error,
    refetch,
  } = useQuery({
    queryKey: BLOG_KEYS.pending,
    queryFn: () => fetchPosts('pending_approval'),
    staleTime: Infinity,
  });

  // Realtime invalidation for the `blog_posts` table is handled once,
  // centrally, by useRealtimeSync() in AdminLayout - not here. A second
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

  // Schedules a pending draft to publish itself automatically at a future
  // time via a Postgres cron job (see project docs) - no one needs to be on
  // the site when it fires. approved_at is set now because scheduling *is*
  // the approval; published_at is left for the cron job to set once it
  // actually goes live.
  const scheduleForLater = useCallback(async (
    id: string,
    scheduledFor: string,
    edits?: Partial<Pick<BlogPost, 'title' | 'body_md' | 'excerpt' | 'seo_title' | 'meta_description'>>,
  ) => {
    queryClient.setQueryData<BlogPost[]>(BLOG_KEYS.pending, (prev = []) =>
      prev.filter((p) => p.id !== id)
    );

    const { error } = await supabase
      .from('blog_posts')
      .update({ ...edits, status: 'scheduled', scheduled_for: scheduledFor, approved_at: new Date().toISOString() })
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

  // "Regenerate" is intentionally not an AI call from the frontend - WF12
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
    isFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,
    approveAndPublish,
    scheduleForLater,
    reject,
    deleteForRegeneration,
    reload: async () => {
      const res = await refetch();
      if (res.error) throw res.error;
    },
  };
}

export function usePublishedBlogPosts() {
  // "Published" also shows scheduled-but-not-yet-live posts, badged
  // separately in the UI, since scheduling a post is the last step before it
  // goes live - there's nothing left to review once it's queued.
  const { data: posts = [], isLoading: loading, isFetching, dataUpdatedAt, error, refetch } = useQuery({
    queryKey: BLOG_KEYS.published,
    queryFn: () => fetchPosts(['published', 'scheduled']),
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

  // Changes the time a scheduled post will go live. Only meaningful while
  // status is still 'scheduled' - the cron job owns the transition to
  // 'published' once scheduled_for arrives.
  const rescheduleFor = useCallback(async (id: string, scheduledFor: string) => {
    const { error } = await supabase.from('blog_posts').update({ scheduled_for: scheduledFor }).eq('id', id);
    if (error) throw new Error(error.message);
    queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
  }, []);

  // Skips the wait and publishes a scheduled post immediately.
  const publishNow = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('blog_posts')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
  }, []);

  // Pulls a scheduled post back into the pending queue for another look,
  // rather than deleting it outright.
  const cancelSchedule = useCallback(async (id: string) => {
    queryClient.setQueryData<BlogPost[]>(BLOG_KEYS.published, (prev = []) =>
      prev.filter((p) => p.id !== id)
    );

    const { error } = await supabase
      .from('blog_posts')
      .update({ status: 'pending_approval', scheduled_for: null })
      .eq('id', id);

    if (error) {
      queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
      throw new Error(error.message);
    }

    queryClient.invalidateQueries({ queryKey: BLOG_KEYS.pending });
  }, []);

  // Permanently removes a live post from the public site - distinct from
  // useBlogQueue's deleteForRegeneration, which is for pending drafts WF12
  // will redraft. There's no "regenerate" implication for something that
  // already went live.
  const deletePublished = useCallback(async (id: string) => {
    queryClient.setQueryData<BlogPost[]>(BLOG_KEYS.published, (prev = []) =>
      prev.filter((p) => p.id !== id)
    );

    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: BLOG_KEYS.published });
      throw new Error(error.message);
    }
  }, []);

  return {
    posts,
    loading,
    isFetching,
    dataUpdatedAt,
    error: (error as Error)?.message ?? null,
    saveEdits,
    rescheduleFor,
    publishNow,
    cancelSchedule,
    deletePublished,
    reload: async () => {
      const res = await refetch();
      if (res.error) throw res.error;
    },
  };
}

// Public post detail page - same onlyLive filter as the listing, so a card
// and its detail page always agree on whether a post exists.
async function fetchPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await onlyLive(
    supabase
      .from('blog_posts')
      .select(
        `id, title, slug, category, body_md, excerpt, cover_image_url,
         seo_title, meta_description, target_keywords, status, author,
         rejection_reason, created_at, approved_at, published_at`
      )
      .eq('slug', slug),
  ).maybeSingle();
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
    staleTime: PUBLIC_STALE_TIME,
  });

  return {
    post: post ?? null,
    loading,
    error: (error as Error)?.message ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public listing (/blog): server-side paginated, card columns only.

export interface BlogPage {
  posts: BlogCardPost[];
  total: number;
}

export async function fetchPublicBlogPage(
  page: number,
  category: BlogCategory | 'all',
): Promise<BlogPage> {
  const from = (page - 1) * BLOG_PAGE_SIZE;
  const to = from + BLOG_PAGE_SIZE - 1;
  let q = onlyLive(
    supabase.from('blog_posts').select(BLOG_CARD_COLUMNS, { count: 'exact' }),
  );
  if (category !== 'all') q = q.eq('category', category);
  const { data, error, count } = await q
    .order('published_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return { posts: (data ?? []) as BlogCardPost[], total: count ?? 0 };
}

function publicBlogPageQuery(page: number, category: BlogCategory | 'all') {
  return {
    queryKey: BLOG_KEYS.publicPage(category, page),
    queryFn: () => fetchPublicBlogPage(page, category),
    staleTime: PUBLIC_STALE_TIME,
  };
}

export function usePublicBlogPage(page: number, category: BlogCategory | 'all') {
  const { data, isLoading: loading, error } = useQuery(publicBlogPageQuery(page, category));
  const total = data?.total ?? 0;
  return {
    posts: data?.posts ?? [],
    total,
    totalPages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)),
    loading,
    error: (error as Error)?.message ?? null,
  };
}

export function prefetchPublicBlogPage(page: number, category: BlogCategory | 'all') {
  return queryClient.prefetchQuery(publicBlogPageQuery(page, category));
}

// Categories with at least one live post, for the filter pills. These can't be
// derived from the current page now that the list is paginated.
async function fetchPublicBlogCategories(): Promise<BlogCategory[]> {
  const { data, error } = await onlyLive(supabase.from('blog_posts').select('category'));
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r: { category: BlogCategory }) => r.category)));
}

export function usePublicBlogCategories() {
  const { data = [] } = useQuery({
    queryKey: BLOG_KEYS.publicCategories,
    queryFn: fetchPublicBlogCategories,
    staleTime: PUBLIC_STALE_TIME,
  });
  return data;
}
