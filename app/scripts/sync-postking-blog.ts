// Daily (05:00 UTC) and manual importer: Shorty Harris PostKing blog → this app's
// `blog_posts` CMS (the /admin/blog queue). New rows are created for PostKing
// `published` articles and for `scheduled` articles that have a schedule date.
// Drafts / unpublished are skipped.
//
// Hard-wired to brand cmvgju3fk1bg9g07zorefgwgu. Never lists or writes any
// other PostKing brand. Does not call the WF12 generate-blog-post webhook.
//
//   npm run sync:postking-blog
//   npm run sync:postking-blog -- --dry-run
//
// Required env: POSTKING_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: POSTKING_API_URL (default https://try.postking.app), DRY_RUN=1

import { createClient } from '@supabase/supabase-js';
import {
  SHORTY_HARRIS_POSTKING_BRAND_ID,
  assertShortyHarrisBrand,
  isImportableCmsStatus,
  mapPostkingStatus,
  parseTags,
  planSync,
  type ExistingBlogPost,
  type PostkingArticle,
  type SkipReason,
  type SyncAction,
  type UpsertRow,
} from '../src/lib/postkingBlogSync.ts';

const DEFAULT_API_URL = 'https://try.postking.app';
const LIST_STATUSES = [undefined, 'published', 'scheduled', 'draft'] as const;

interface CliOptions {
  dryRun: boolean;
  apiUrl: string;
  token: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  brandId: string;
}

function parseArgs(argv: string[]): CliOptions {
  const dryRun = argv.includes('--dry-run') || process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const apiUrl = (process.env.POSTKING_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
  const token = process.env.POSTKING_API_TOKEN || process.env.POSTKING_API_KEY || '';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const brandId = assertShortyHarrisBrand(
    process.env.POSTKING_BRAND_ID || SHORTY_HARRIS_POSTKING_BRAND_ID,
  );

  if (!token) {
    throw new Error('POSTKING_API_TOKEN is required (a PostKing API key with access to the Shorty Harris brand).');
  }
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required (dry-run still reads existing rows so it can report skips).');
  }

  return { dryRun, apiUrl, token, supabaseUrl, serviceRoleKey, brandId };
}

async function postkingGet<T>(opts: CliOptions, path: string): Promise<T> {
  const url = `${opts.apiUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json() as { error?: { message?: string } | string; message?: string };
      if (typeof body.error === 'object' && body.error?.message) detail = body.error.message;
      else if (typeof body.error === 'string') detail = body.error;
      else if (body.message) detail = body.message;
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`PostKing ${res.status} on ${path}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

interface ListedArticle {
  id: string;
  status?: string;
  slug?: string;
  title?: string;
  scheduledAt?: string | null;
  postDate?: string | null;
  updatedAt?: string | null;
}

function asListed(raw: Record<string, unknown>): ListedArticle | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;
  return {
    id,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    slug: typeof raw.slug === 'string' ? raw.slug : typeof raw.postSlug === 'string' ? raw.postSlug : undefined,
    title: typeof raw.title === 'string' ? raw.title : typeof raw.postTitle === 'string' ? raw.postTitle : undefined,
    scheduledAt: typeof raw.scheduledAt === 'string' ? raw.scheduledAt : null,
    postDate: typeof raw.postDate === 'string' ? raw.postDate : typeof raw.publishedAt === 'string' ? raw.publishedAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

async function listBrandArticles(opts: CliOptions): Promise<ListedArticle[]> {
  const brand = opts.brandId;
  const byId = new Map<string, ListedArticle>();

  for (const status of LIST_STATUSES) {
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const data = await postkingGet<Record<string, unknown>>(
        opts,
        `/api/agent/v1/brands/${brand}/blogs${qs({
          limit: 200,
          status,
          cursor,
          includeBody: 'false',
        })}`,
      );
      const rows = (
        Array.isArray(data.blogs) ? data.blogs
          : Array.isArray(data.articles) ? data.articles
            : []
      ) as Record<string, unknown>[];
      for (const raw of rows) {
        const item = asListed(raw);
        if (item) byId.set(item.id, item);
      }

      const pagination = data.pagination as { hasMore?: boolean; nextCursor?: string } | undefined;
      if (pagination?.nextCursor) {
        cursor = pagination.nextCursor;
        continue;
      }
      if (pagination?.hasMore === true && rows.length > 0) {
        // No cursor to follow — avoid an infinite loop.
        break;
      }
      break;
    }
  }

  // Inventory from the sync-oriented changes feed (status=all includes
  // drafts + scheduled + published). Merge, don't replace.
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = await postkingGet<{
      items?: Array<Record<string, unknown>>;
      nextCursor?: string;
      hasMore?: boolean;
    }>(
      opts,
      `/api/agent/v1/brands/${brand}/content/changes${qs({
        types: 'blog_article',
        status: 'all',
        limit: 500,
        cursor,
      })}`,
    );
    for (const raw of data.items ?? []) {
      if (raw.type && raw.type !== 'blog_article') continue;
      const item = asListed(raw);
      if (item) byId.set(item.id, { ...byId.get(item.id), ...item });
    }
    if (!data.hasMore || !data.nextCursor) break;
    cursor = data.nextCursor;
  }

  return [...byId.values()];
}

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function normalizeArticle(raw: Record<string, unknown>, listed: ListedArticle, brandId: string): PostkingArticle {
  const post = (raw.post && typeof raw.post === 'object') ? raw.post as Record<string, unknown> : raw;
  const meta = (raw.meta && typeof raw.meta === 'object') ? raw.meta as Record<string, unknown> : {};
  const site = (raw.siteMetadata && typeof raw.siteMetadata === 'object') ? raw.siteMetadata as Record<string, unknown> : {};
  const authorObj = (raw.author && typeof raw.author === 'object') ? raw.author as Record<string, unknown> : null;

  const status = pickString(raw.status, post.status, meta.status, listed.status) || 'draft';
  const slug = pickString(raw.slug, post.slug, meta.slug, listed.slug) || '';
  const title = pickString(raw.title, post.title, listed.title) || slug || 'Untitled';

  return {
    id: pickString(raw.id, post.id, meta.id, listed.id) || listed.id,
    brandId,
    title,
    slug,
    status,
    content: pickString(raw.content, post.content) || '',
    excerpt: pickString(raw.excerpt, raw.description, post.description),
    seoTitle: pickString(raw.metaTitle, raw.seoTitle, site.title),
    metaDescription: pickString(raw.metaDescription, site.description),
    coverImageUrl: pickString(raw.featuredImageUrl, raw.image, post.image),
    author: pickString(raw.author, authorObj?.name) || 'Shorty Harris',
    tags: parseTags(raw.tags ?? post.tags),
    category: pickString(
      typeof raw.category === 'string' ? raw.category : null,
      typeof post.category === 'string' ? post.category : null,
      (raw.category && typeof raw.category === 'object')
        ? pickString((raw.category as Record<string, unknown>).slug, (raw.category as Record<string, unknown>).name)
        : null,
    ),
    publishedAt: pickString(raw.publishedAt, raw.postDate, post.publishedAt, meta.publishedAt, listed.postDate),
    scheduledAt: pickString(raw.scheduledAt, listed.scheduledAt),
    contentHash: pickString(raw.contentHash, meta.contentHash),
  };
}

async function loadFullArticle(opts: CliOptions, listed: ListedArticle): Promise<PostkingArticle> {
  const brand = opts.brandId;
  const status = (listed.status ?? '').toLowerCase();

  if (status === 'published' || status === 'live') {
    try {
      const exported = await postkingGet<Record<string, unknown>>(
        opts,
        `/api/agent/v1/brands/${brand}/export/blog-article${qs({
          id: listed.id,
          version: 'published',
        })}`,
      );
      return normalizeArticle(exported, listed, brand);
    } catch (err) {
      console.warn(`export_blog_article failed for ${listed.id} (${listed.slug ?? ''}): ${(err as Error).message}; falling back to get_blog_article`);
    }
  }

  const raw = await postkingGet<Record<string, unknown>>(
    opts,
    `/api/agent/v1/brands/${brand}/blogs/${listed.id}`,
  );
  return normalizeArticle(raw, listed, brand);
}

async function loadExisting(opts: CliOptions): Promise<{
  byId: Map<string, ExistingBlogPost>;
  bySlug: Map<string, ExistingBlogPost>;
}> {
  const supabase = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, postking_article_id, content_hash, status, scheduled_for, published_at');
  if (error) {
    throw new Error(
      `Failed to read blog_posts (${error.message}). Apply supabase/migrations/20261020180000_blog_posts_postking_sync.sql in the Supabase SQL editor first.`,
    );
  }
  const byId = new Map<string, ExistingBlogPost>();
  const bySlug = new Map<string, ExistingBlogPost>();
  for (const row of (data ?? []) as ExistingBlogPost[]) {
    if (row.postking_article_id) byId.set(row.postking_article_id, row);
    if (row.slug) bySlug.set(row.slug, row);
  }
  return { byId, bySlug };
}

type BlogPostsWriter = {
  from: (table: 'blog_posts') => {
    insert: (row: UpsertRow) => PromiseLike<{ error: { message: string } | null }>;
    update: (row: UpsertRow) => {
      eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

async function applyAction(supabase: BlogPostsWriter, action: SyncAction): Promise<void> {
  if (action.type === 'skip') return;
  if (action.type === 'insert') {
    const { error } = await supabase.from('blog_posts').insert(action.row);
    if (error) throw new Error(`Insert ${action.slug} failed: ${error.message}`);
    return;
  }
  const { error } = await supabase.from('blog_posts').update(action.row).eq('id', action.existingId);
  if (error) throw new Error(`Update ${action.slug} failed: ${error.message}`);
}

function summarize(actions: SyncAction[]): string {
  const counts = {
    insert: 0,
    update: 0,
    skipped: 0,
    not_scheduled: 0,
    missing_schedule_date: 0,
    unchanged: 0,
    slug_conflict: 0,
  };
  for (const a of actions) {
    if (a.type === 'insert') {
      counts.insert += 1;
      continue;
    }
    if (a.type === 'update') {
      counts.update += 1;
      continue;
    }
    counts.skipped += 1;
    const reason: SkipReason = a.reason;
    if (reason === 'not_scheduled') counts.not_scheduled += 1;
    else if (reason === 'missing_schedule_date') counts.missing_schedule_date += 1;
    else if (reason === 'unchanged') counts.unchanged += 1;
    else counts.slug_conflict += 1;
  }
  return [
    `insert=${counts.insert}`,
    `update=${counts.update}`,
    `skipped=${counts.skipped}`,
    `(not_scheduled=${counts.not_scheduled}`,
    `missing_schedule_date=${counts.missing_schedule_date}`,
    `unchanged=${counts.unchanged}`,
    `slug_conflict=${counts.slug_conflict})`,
  ].join(' ');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertShortyHarrisBrand(opts.brandId);
  console.log(`PostKing → Shorty Harris blog sync`);
  console.log(`brand=${opts.brandId} api=${opts.apiUrl} dryRun=${opts.dryRun}`);

  const listed = await listBrandArticles(opts);
  console.log(`listed ${listed.length} Shorty Harris article(s)`);

  const existing = await loadExisting(opts);
  const supabase = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  const actions: SyncAction[] = [];

  for (const item of listed) {
    const alreadyImported = existing.byId.has(item.id);
    // Fetch full payloads for published + scheduled. Skip drafts here so we
    // do not import unpublished content that should not go live. Already-
    // imported rows still load so scheduled → published updates apply.
    if (!alreadyImported && !isImportableCmsStatus(mapPostkingStatus(item.status))) {
      const action: SyncAction = {
        type: 'skip',
        reason: 'not_scheduled',
        articleId: item.id,
        slug: item.slug || item.id,
      };
      actions.push(action);
      console.log(`  ${(item.status || 'unknown').padEnd(12)} ${item.slug || item.id} (not_scheduled)`);
      continue;
    }

    const full = await loadFullArticle(opts, item);
    if (full.brandId) assertShortyHarrisBrand(full.brandId);
    const action = planSync(full, existing.byId, existing.bySlug, nowIso, opts.apiUrl);
    actions.push(action);
    const extra = action.type === 'skip' ? ` (${action.reason})` : ` → ${action.type} ${action.row.status}`;
    console.log(`  ${full.status.padEnd(10)} ${full.slug || full.id}${extra}`);

    if (!opts.dryRun && action.type !== 'skip') {
      await applyAction(supabase as unknown as BlogPostsWriter, action);
      const written: ExistingBlogPost = {
        id: action.type === 'update' ? action.existingId : action.articleId,
        slug: action.row.slug,
        postking_article_id: action.row.postking_article_id,
        content_hash: action.row.content_hash,
        status: action.row.status,
        scheduled_for: action.row.scheduled_for,
        published_at: action.row.published_at,
      };
      existing.byId.set(action.articleId, written);
      existing.bySlug.set(action.row.slug, written);
    }
  }

  console.log(`done ${summarize(actions)}${opts.dryRun ? ' (dry-run, no writes)' : ''}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
