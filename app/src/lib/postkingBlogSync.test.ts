import { describe, expect, it } from 'vitest';
import {
  SHORTY_HARRIS_POSTKING_BRAND_ID,
  absolutizeHtml,
  assertShortyHarrisBrand,
  computeContentHash,
  isScheduledImport,
  mapCategory,
  mapPostkingStatus,
  parseTags,
  planSync,
  resolveMediaUrl,
  slugify,
  toUpsertRow,
  type ExistingBlogPost,
  type PostkingArticle,
} from './postkingBlogSync';

const API = 'https://try.postking.app';
const NOW = '2026-10-20T18:00:00.000Z';

function article(overrides: Partial<PostkingArticle> = {}): PostkingArticle {
  return {
    id: 'pk_sched_1',
    brandId: SHORTY_HARRIS_POSTKING_BRAND_ID,
    title: 'How rural shops get found',
    slug: 'how-rural-shops-get-found',
    status: 'scheduled',
    content: '<p>Hello</p>',
    excerpt: 'A short excerpt',
    seoTitle: 'SEO title',
    metaDescription: 'Meta desc',
    coverImageUrl: '/api/uploads/cover.jpg',
    author: 'Shorty Harris',
    tags: ['rural', 'outreach'],
    category: 'rural',
    scheduledAt: '2026-10-22T09:00:00.000Z',
    publishedAt: null,
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingBlogPost> = {}): ExistingBlogPost {
  return {
    id: 'cms-uuid-1',
    slug: 'how-rural-shops-get-found',
    postking_article_id: 'pk_sched_1',
    content_hash: 'old',
    status: 'scheduled',
    scheduled_for: '2026-10-22T09:00:00.000Z',
    published_at: null,
    ...overrides,
  };
}

describe('assertShortyHarrisBrand', () => {
  it('accepts only the Shorty Harris brand id', () => {
    expect(assertShortyHarrisBrand(SHORTY_HARRIS_POSTKING_BRAND_ID)).toBe(SHORTY_HARRIS_POSTKING_BRAND_ID);
  });

  it('refuses Jackies, TUTEL, Martin Vitek, and any other id', () => {
    expect(() => assertShortyHarrisBrand('cmvf65h2r8nyhg0ai02i6inx0')).toThrow(/Jackies/);
    expect(() => assertShortyHarrisBrand('cmratarbi0096g0f4qu529lm2')).toThrow(/TUTEL/);
    expect(() => assertShortyHarrisBrand('cmlknus7n05vwg0fr8lmha0qc')).toThrow(/Martin Vitek/);
    expect(() => assertShortyHarrisBrand('some-other-brand')).toThrow(/hard-wired to Shorty Harris/);
    expect(() => assertShortyHarrisBrand('')).toThrow(/required/);
  });
});

describe('status mapping', () => {
  it('maps published and scheduled, and treats unpublished/draft as draft', () => {
    expect(mapPostkingStatus('published')).toBe('published');
    expect(mapPostkingStatus('SCHEDULED')).toBe('scheduled');
    expect(mapPostkingStatus('unpublished')).toBe('draft');
    expect(mapPostkingStatus('draft')).toBe('draft');
    expect(mapPostkingStatus('pending')).toBe('draft');
    expect(mapPostkingStatus('')).toBe('draft');
    expect(mapPostkingStatus(undefined)).toBe('draft');
  });

  it('treats only scheduled-with-a-date as a new import', () => {
    expect(isScheduledImport({ status: 'scheduled', scheduledAt: '2026-10-22T09:00:00.000Z' })).toBe(true);
    expect(isScheduledImport({ status: 'scheduled', scheduledAt: null })).toBe(false);
    expect(isScheduledImport({ status: 'unpublished', scheduledAt: '2026-10-22T09:00:00.000Z' })).toBe(false);
    expect(isScheduledImport({ status: 'published', scheduledAt: null })).toBe(false);
  });
});

describe('toUpsertRow', () => {
  it('keeps a scheduled PostKing article scheduled with its date', () => {
    const row = toUpsertRow(article(), NOW, API);
    expect(row.status).toBe('scheduled');
    expect(row.scheduled_for).toBe('2026-10-22T09:00:00.000Z');
    expect(row.published_at).toBeNull();
    expect(row.approved_at).toBe(NOW);
    expect(row.postking_article_id).toBe('pk_sched_1');
    expect(row.category).toBe('business_development_rural');
    expect(row.cover_image_url).toBe('https://try.postking.app/api/uploads/cover.jpg');
  });

  it('maps a published payload for in-place updates of already-imported rows', () => {
    const row = toUpsertRow(article({
      status: 'published',
      publishedAt: '2026-09-01T12:00:00.000Z',
      scheduledAt: null,
    }), NOW, API);
    expect(row.status).toBe('published');
    expect(row.published_at).toBe('2026-09-01T12:00:00.000Z');
    expect(row.scheduled_for).toBeNull();
  });
});

describe('planSync', () => {
  it('inserts a scheduled article with a date when neither PostKing id nor slug exists', () => {
    const action = planSync(article(), new Map(), new Map(), NOW, API);
    expect(action.type).toBe('insert');
    if (action.type === 'insert') {
      expect(action.row.status).toBe('scheduled');
      expect(action.row.scheduled_for).toBe('2026-10-22T09:00:00.000Z');
    }
  });

  it('skips unpublished and draft articles instead of inserting them', () => {
    expect(planSync(article({ status: 'unpublished' }), new Map(), new Map(), NOW, API))
      .toMatchObject({ type: 'skip', reason: 'not_scheduled' });
    expect(planSync(article({ status: 'draft' }), new Map(), new Map(), NOW, API))
      .toMatchObject({ type: 'skip', reason: 'not_scheduled' });
  });

  it('skips a scheduled article that has no schedule date', () => {
    expect(planSync(article({ scheduledAt: null }), new Map(), new Map(), NOW, API))
      .toMatchObject({ type: 'skip', reason: 'missing_schedule_date' });
  });

  it('does not insert a published article that was never imported', () => {
    expect(planSync(article({
      status: 'published',
      publishedAt: '2026-09-01T12:00:00.000Z',
      scheduledAt: null,
    }), new Map(), new Map(), NOW, API)).toMatchObject({ type: 'skip', reason: 'not_scheduled' });
  });

  it('updates an already-imported row when PostKing later publishes it', () => {
    const byId = new Map([['pk_sched_1', existing()]]);
    const action = planSync(article({
      status: 'published',
      publishedAt: '2026-10-22T09:00:00.000Z',
      scheduledAt: null,
    }), byId, new Map(), NOW, API);
    expect(action.type).toBe('update');
    if (action.type === 'update') {
      expect(action.existingId).toBe('cms-uuid-1');
      expect(action.row.status).toBe('published');
      expect(action.row.published_at).toBe('2026-10-22T09:00:00.000Z');
    }
  });

  it('does not rewrite an imported row back to draft if PostKing unpublishes it', () => {
    const byId = new Map([['pk_sched_1', existing()]]);
    expect(planSync(article({ status: 'unpublished' }), byId, new Map(), NOW, API))
      .toMatchObject({ type: 'skip', reason: 'not_scheduled' });
  });

  it('updates in place when the PostKing id matches and content changed', () => {
    const byId = new Map([['pk_sched_1', existing()]]);
    const action = planSync(article({ content: '<p>Updated</p>' }), byId, new Map(), NOW, API);
    expect(action.type).toBe('update');
    if (action.type === 'update') expect(action.existingId).toBe('cms-uuid-1');
  });

  it('skips when the stored hash and schedule are unchanged', () => {
    const row = toUpsertRow(article(), NOW, API);
    const byId = new Map([['pk_sched_1', existing({ content_hash: row.content_hash })]]);
    const action = planSync(article(), byId, new Map(), NOW, API);
    expect(action).toEqual({
      type: 'skip',
      reason: 'unchanged',
      articleId: 'pk_sched_1',
      slug: 'how-rural-shops-get-found',
    });
  });

  it('claims an existing slug with no PostKing id (no duplicate)', () => {
    const bySlug = new Map([['how-rural-shops-get-found', existing({
      postking_article_id: null,
      content_hash: null,
    })]]);
    const action = planSync(article(), new Map(), bySlug, NOW, API);
    expect(action.type).toBe('update');
    if (action.type === 'update') expect(action.existingId).toBe('cms-uuid-1');
  });

  it('does not steal a slug owned by a different PostKing article', () => {
    const bySlug = new Map([['how-rural-shops-get-found', existing({
      id: 'other-row',
      postking_article_id: 'pk_other',
    })]]);
    const action = planSync(article(), new Map(), bySlug, NOW, API);
    expect(action).toMatchObject({ type: 'skip', reason: 'slug_conflict', conflictingId: 'other-row' });
  });

  it('refuses an article tagged with another brand', () => {
    expect(() => planSync(
      article({ brandId: 'cmvf65h2r8nyhg0ai02i6inx0' }),
      new Map(),
      new Map(),
      NOW,
      API,
    )).toThrow(/Jackies/);
  });
});

describe('helpers', () => {
  it('maps categories and parses tags', () => {
    expect(mapCategory('family_business')).toBe('family_business');
    expect(mapCategory('Small Business')).toBe('small_business');
    expect(mapCategory('general')).toBe('general');
    expect(mapCategory('unknown')).toBe('general');
    expect(parseTags('["a","b"]')).toEqual(['a', 'b']);
    expect(parseTags(['c'])).toEqual(['c']);
  });

  it('resolves relative PostKing media and HTML urls', () => {
    expect(resolveMediaUrl('/api/uploads/x.png', API)).toBe('https://try.postking.app/api/uploads/x.png');
    expect(resolveMediaUrl('https://cdn.postking.app/x.png', API)).toBe('https://cdn.postking.app/x.png');
    expect(absolutizeHtml('<img src="/api/uploads/a.jpg">', API))
      .toBe('<img src="https://try.postking.app/api/uploads/a.jpg">');
  });

  it('slugifies titles and is stable for the same hash inputs', () => {
    expect(slugify('Hello, Rural Shop!')).toBe('hello-rural-shop');
    const a = computeContentHash({
      title: 't', slug: 's', status: 'draft', body: 'b', excerpt: null,
      seoTitle: null, metaDescription: null, coverImageUrl: null,
      scheduledFor: null, publishedAt: null, category: 'general',
    });
    const b = computeContentHash({
      title: 't', slug: 's', status: 'draft', body: 'b', excerpt: null,
      seoTitle: null, metaDescription: null, coverImageUrl: null,
      scheduledFor: null, publishedAt: null, category: 'general',
    });
    expect(a).toBe(b);
    expect(a.startsWith('sha256:')).toBe(true);
  });
});
