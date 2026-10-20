// Maps PostKing blog articles onto this app's `blog_posts` CMS rows.
// Used by `app/scripts/sync-postking-blog.ts` — not imported by the UI.

export const SHORTY_HARRIS_POSTKING_BRAND_ID = 'cmvgju3fk1bg9g07zorefgwgu';

export const FORBIDDEN_POSTKING_BRAND_IDS = [
  'cmvf65h2r8nyhg0ai02i6inx0', // Jackies
  'cmratarbi0096g0f4qu529lm2', // TUTEL
  'cmlknus7n05vwg0fr8lmha0qc', // Martin Vitek
] as const;

export type BlogCategory =
  | 'family_business'
  | 'small_business'
  | 'business_development_rural'
  | 'general';

export type CmsStatus = 'draft' | 'scheduled' | 'published';

export interface PostkingArticle {
  id: string;
  brandId?: string | null;
  title: string;
  slug: string;
  status: string;
  content: string;
  excerpt?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  coverImageUrl?: string | null;
  author?: string | null;
  tags?: string[];
  category?: string | null;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  contentHash?: string | null;
}

export interface ExistingBlogPost {
  id: string;
  slug: string;
  postking_article_id: string | null;
  content_hash: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
}

export interface UpsertRow {
  title: string;
  slug: string;
  category: BlogCategory;
  body_md: string;
  excerpt: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  meta_description: string | null;
  target_keywords: string[];
  status: CmsStatus;
  author: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  approved_at: string | null;
  postking_article_id: string;
  content_hash: string;
}

export type SyncAction =
  | { type: 'skip'; reason: 'unchanged'; articleId: string; slug: string }
  | { type: 'skip'; reason: 'slug_conflict'; articleId: string; slug: string; conflictingId: string }
  | { type: 'insert'; articleId: string; slug: string; row: UpsertRow }
  | { type: 'update'; articleId: string; slug: string; existingId: string; row: UpsertRow };

export function assertShortyHarrisBrand(brandId: string | null | undefined): string {
  const id = (brandId ?? '').trim();
  if (!id) {
    throw new Error(
      `PostKing brand id is required and must be the Shorty Harris brand (${SHORTY_HARRIS_POSTKING_BRAND_ID}).`,
    );
  }
  if (id !== SHORTY_HARRIS_POSTKING_BRAND_ID) {
    throw new Error(
      `Refusing to sync PostKing brand ${id}. This importer is hard-wired to Shorty Harris (${SHORTY_HARRIS_POSTKING_BRAND_ID}) and never reads Jackies, TUTEL, Martin Vitek, or any other brand.`,
    );
  }
  return id;
}

export function mapPostkingStatus(status: string | null | undefined): CmsStatus {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized === 'published' || normalized === 'live') return 'published';
  if (normalized === 'scheduled' || normalized === 'schedule') return 'scheduled';
  return 'draft';
}

export function mapCategory(raw: string | null | undefined): BlogCategory {
  const key = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'family_business' || key === 'familybusiness') return 'family_business';
  if (key === 'small_business' || key === 'smallbusiness') return 'small_business';
  if (
    key === 'business_development_rural'
    || key === 'rural_business_development'
    || key === 'rural'
    || key === 'rural_business'
  ) {
    return 'business_development_rural';
  }
  if (key === 'general') return 'general';

  const label = (raw ?? '').trim().toLowerCase();
  if (label.includes('family')) return 'family_business';
  if (label.includes('small business') || label.includes('smb')) return 'small_business';
  if (label.includes('rural')) return 'business_development_rural';
  return 'general';
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      return raw.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

export function resolveMediaUrl(url: string | null | undefined, apiBase: string): string | null {
  const value = (url ?? '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = apiBase.replace(/\/$/, '');
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value}`;
}

export function absolutizeHtml(html: string, apiBase: string): string {
  const base = apiBase.replace(/\/$/, '');
  return html.replace(
    /(src|href)=["'](\/api\/[^"']+)["']/gi,
    (_m, attr: string, path: string) => `${attr}="${base}${path}"`,
  );
}

export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'post';
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function computeContentHash(parts: {
  title: string;
  slug: string;
  status: CmsStatus;
  body: string;
  excerpt: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  coverImageUrl: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  category: BlogCategory;
}): string {
  const payload = JSON.stringify({
    title: parts.title,
    slug: parts.slug,
    status: parts.status,
    body: parts.body,
    excerpt: parts.excerpt,
    seoTitle: parts.seoTitle,
    metaDescription: parts.metaDescription,
    coverImageUrl: parts.coverImageUrl,
    scheduledFor: parts.scheduledFor,
    publishedAt: parts.publishedAt,
    category: parts.category,
  });
  return `sha256:${fnv1a64(payload)}`;
}

// Small non-crypto fingerprint so the module stays browser-safe for vitest.
// Collision risk is irrelevant: we only skip writes when this matches the
// previously stored hash of the *same* PostKing article.
function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export function toUpsertRow(
  article: PostkingArticle,
  nowIso: string,
  apiBase: string,
): UpsertRow {
  const status = mapPostkingStatus(article.status);
  const slug = (article.slug || '').trim() || slugify(article.title);
  const body = absolutizeHtml(article.content ?? '', apiBase);
  const excerpt = article.excerpt?.trim() || article.metaDescription?.trim() || null;
  const seoTitle = article.seoTitle?.trim() || null;
  const metaDescription = article.metaDescription?.trim() || excerpt;
  const coverImageUrl = resolveMediaUrl(article.coverImageUrl, apiBase);
  const category = mapCategory(article.category);
  const publishedAt = status === 'published' ? isoOrNull(article.publishedAt) ?? nowIso : null;
  const scheduledFor = status === 'scheduled' ? isoOrNull(article.scheduledAt) : null;
  const approvedAt = status === 'draft' ? null : nowIso;

  if (status === 'scheduled' && !scheduledFor) {
    // Scheduled in PostKing but missing a date — keep it off the public site.
    return toUpsertRow({ ...article, status: 'draft' }, nowIso, apiBase);
  }

  const contentHash = article.contentHash?.trim()
    || computeContentHash({
      title: article.title,
      slug,
      status,
      body,
      excerpt,
      seoTitle,
      metaDescription,
      coverImageUrl,
      scheduledFor,
      publishedAt,
      category,
    });

  return {
    title: article.title.trim() || slug,
    slug,
    category,
    body_md: body,
    excerpt,
    cover_image_url: coverImageUrl,
    seo_title: seoTitle,
    meta_description: metaDescription,
    target_keywords: article.tags ?? [],
    status,
    author: article.author?.trim() || 'Shorty Harris',
    published_at: publishedAt,
    scheduled_for: scheduledFor,
    approved_at: approvedAt,
    postking_article_id: article.id,
    content_hash: contentHash,
  };
}

export function planSync(
  article: PostkingArticle,
  existingByPostkingId: Map<string, ExistingBlogPost>,
  existingBySlug: Map<string, ExistingBlogPost>,
  nowIso: string,
  apiBase: string,
): SyncAction {
  if (article.brandId) assertShortyHarrisBrand(article.brandId);

  const row = toUpsertRow(article, nowIso, apiBase);
  const byId = existingByPostkingId.get(article.id);
  const bySlug = existingBySlug.get(row.slug);

  if (byId) {
    const slugOwner = existingBySlug.get(row.slug);
    if (slugOwner && slugOwner.id !== byId.id && slugOwner.postking_article_id && slugOwner.postking_article_id !== article.id) {
      return { type: 'skip', reason: 'slug_conflict', articleId: article.id, slug: row.slug, conflictingId: slugOwner.id };
    }
    if (byId.content_hash === row.content_hash && byId.status === row.status
      && (byId.scheduled_for ?? null) === (row.scheduled_for ?? null)
      && (byId.published_at ?? null) === (row.published_at ?? null)
      && byId.slug === row.slug) {
      return { type: 'skip', reason: 'unchanged', articleId: article.id, slug: row.slug };
    }
    return { type: 'update', articleId: article.id, slug: row.slug, existingId: byId.id, row };
  }

  if (bySlug) {
    if (bySlug.postking_article_id && bySlug.postking_article_id !== article.id) {
      return { type: 'skip', reason: 'slug_conflict', articleId: article.id, slug: row.slug, conflictingId: bySlug.id };
    }
    if (bySlug.content_hash === row.content_hash && bySlug.status === row.status
      && (bySlug.scheduled_for ?? null) === (row.scheduled_for ?? null)) {
      return { type: 'skip', reason: 'unchanged', articleId: article.id, slug: row.slug };
    }
    return { type: 'update', articleId: article.id, slug: row.slug, existingId: bySlug.id, row };
  }

  return { type: 'insert', articleId: article.id, slug: row.slug, row };
}
