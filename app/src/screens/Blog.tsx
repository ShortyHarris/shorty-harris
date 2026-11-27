import { useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PublicNav } from '../components/PublicNav';
import { PublicFooter } from '../components/PublicFooter';
import { useSeo } from '../hooks/useSeo';
import { PUBLIC_PAGES } from '../lib/publicPages';
import {
  BLOG_PAGE_SIZE,
  prefetchPublicBlogPage,
  usePublicBlogCategories,
  usePublicBlogPage,
} from '../hooks/useBlogPosts';
import type { BlogCardPost, BlogCategory } from '../hooks/useBlogPosts';
import { CARD_IMAGE_WIDTHS, responsiveImage } from '../lib/supabaseImage';

const CATEGORY_LABEL: Record<BlogCategory, string> = {
  family_business: 'Family Business',
  small_business: 'Small Business',
  business_development_rural: 'Rural Business Development',
  general: 'General',
};

// Editorial blog (the "Blog page" artboards of the landing page redesign). Page 1
// opens with the newest post as a large feature, the next three as "Latest",
// and the rest as a list; later pages are the list only.
const FEATURE_SIZES = '(min-width:1024px) 900px, 100vw';
// The feature runs up to ~1100px wide, so it also offers a sharper size.
const FEATURE_WIDTHS = [...CARD_IMAGE_WIDTHS, 1280];
const LATEST_SIZES = '(min-width:1024px) 360px, 280px';
const ROW_SIZES = '(min-width:640px) 190px, 120px';
// The feature and the first "Latest" cards are above the fold - load them straight away.
const EAGER_CARD_COUNT = 3;
const LATEST_COUNT = 3;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseCategory(raw: string | null): BlogCategory | 'all' {
  return raw && raw in CATEGORY_LABEL ? (raw as BlogCategory) : 'all';
}

// Query string for a given page/category; page 1 and "all" are left out so
// the canonical /blog URL stays clean.
function searchFor(page: number, category: BlogCategory | 'all'): string {
  const params = new URLSearchParams();
  if (category !== 'all') params.set('category', category);
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

// 1 … 4 5 6 … 12 - always first, last, and the neighbours of the current page.
function pageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = [1, current - 1, current, current + 1, total]
    .filter((p) => p >= 1 && p <= total)
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  keep.forEach((p, i) => {
    if (i > 0 && p - keep[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

function whenIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(cb);
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 200);
  return () => window.clearTimeout(id);
}

export function Blog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePage(searchParams.get('page'));
  const activeCategory = parseCategory(searchParams.get('category'));

  useSeo({
    title: page > 1 ? `Blog - Page ${page}` : 'Blog',
    description: PUBLIC_PAGES.blog.description,
    // Canonical never carries ?page= / ?category= (see canonicalUrl).
    path: PUBLIC_PAGES.blog.path,
  });

  const { posts, total, totalPages, loading, error } = usePublicBlogPage(page, activeCategory);
  const categories = usePublicBlogCategories();

  // A stale or hand-edited ?page= past the end lands on the last real page.
  useEffect(() => {
    if (!loading && total > 0 && page > totalPages) {
      setSearchParams(searchFor(totalPages, activeCategory), { replace: true });
    }
  }, [loading, total, page, totalPages, activeCategory, setSearchParams]);

  // Scroll to top whenever the page or filter changes (not on first load, so
  // back-navigation and anchor links keep their position).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, activeCategory]);

  // Warm the next page once the browser is idle, so "Next" is instant.
  useEffect(() => {
    if (loading || page >= totalPages) return;
    return whenIdle(() => { void prefetchPublicBlogPage(page + 1, activeCategory); });
  }, [loading, page, totalPages, activeCategory]);

  const selectCategory = (c: BlogCategory | 'all') => setSearchParams(searchFor(1, c));

  const showFeature = page === 1 && posts.length > 0;
  const feature = showFeature ? posts[0] : null;
  const latest = showFeature ? posts.slice(1, 1 + LATEST_COUNT) : [];
  const rest = showFeature ? posts.slice(1 + LATEST_COUNT) : posts;
  const options: { key: BlogCategory | 'all'; label: string }[] = [
    { key: 'all', label: 'All posts' },
    ...categories.map((c) => ({ key: c, label: CATEGORY_LABEL[c] ?? c })),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink-strong font-inter antialiased">
      <PublicNav />

      <main className="flex w-full flex-col gap-7 px-5 pb-20 pt-6 lg:flex-row lg:items-start lg:gap-[72px] lg:px-12 lg:pb-28 lg:pt-14">
        <aside className="lg:sticky lg:top-28 lg:w-[200px] lg:flex-none">
          <h1 className="m-0 font-serif text-[46px] font-normal leading-none tracking-[-0.02em] lg:mb-7 lg:text-[44px]">Blog</h1>
          {categories.length > 1 && (
            <nav aria-label="Blog categories" className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:mt-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:p-0">
              {options.map((o) => {
                const active = activeCategory === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => selectCategory(o.key)}
                    onMouseEnter={() => prefetchPublicBlogPage(1, o.key)}
                    aria-pressed={active}
                    className={`flex-none cursor-pointer whitespace-nowrap rounded-full border border-solid px-4 py-2.5 text-left text-[14px] transition-colors lg:rounded-lg lg:border-0 lg:px-3 lg:py-[9px] lg:text-[15px] ${
                      active
                        ? 'border-brand bg-brand font-semibold text-white lg:bg-[#f3eaff] lg:text-[#5a0bc0]'
                        : 'border-hairline bg-white text-ink-muted hover:text-ink-strong lg:bg-transparent lg:hover:bg-[#f7f7f7]'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        <div className="min-w-0 max-w-[1100px] flex-1">
          {error && (
            <div className="mb-10 rounded-xl border border-solid border-hairline bg-[#f9f6ff] px-4 py-3 text-[14px]">{error}</div>
          )}

          {loading ? (
            <div className="flex flex-col gap-11">
              {Array.from({ length: BLOG_PAGE_SIZE }).map((_, i) => <PostCardSkeleton key={i} />)}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline p-10 text-center text-[15px] text-ink-muted">
              {activeCategory === 'all' ? 'Nothing published yet - check back soon.' : 'No posts in this category yet.'}
            </div>
          ) : (
            <>
              {feature && <FeatureCard post={feature} />}

              {latest.length > 0 && (
                <section className="mt-14 lg:mt-24">
                  <h2 className="m-0 mb-5 font-serif text-[32px] font-normal tracking-[-0.02em] lg:mb-7 lg:text-[38px]">Latest</h2>
                  <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-7 lg:overflow-visible lg:p-0">
                    {latest.map((post, i) => <LatestCard key={post.id} post={post} index={i + 1} />)}
                  </div>
                </section>
              )}

              {rest.length > 0 && (
                <section className={showFeature ? 'mt-16 lg:mt-28' : ''}>
                  {showFeature && (
                    <h2 className="m-0 mb-7 font-serif text-[32px] font-normal tracking-[-0.02em] lg:mb-9 lg:text-[38px]">More posts</h2>
                  )}
                  <div className="flex flex-col gap-8 lg:gap-11">
                    {rest.map((post, i) => (
                      <PostRow key={post.id} post={post} index={(showFeature ? 1 + latest.length : 0) + i} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!loading && totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} category={activeCategory} />
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function Byline({ post }: { post: BlogCardPost }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted lg:mt-3.5">
      <span aria-hidden className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-lilac text-[11px] font-semibold text-brand">S</span>
      Shorty Harris
      <span aria-hidden>·</span>
      {CATEGORY_LABEL[post.category] ?? post.category}
      {post.published_at && (
        <>
          <span aria-hidden>·</span>
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
        </>
      )}
    </div>
  );
}

/* One <img> for every card shape, so loading behaviour stays the same everywhere. */
function Cover({ post, index, sizes, className, large = false }: {
  post: BlogCardPost; index: number; sizes: string; className: string; large?: boolean;
}) {
  const image = post.cover_image_url
    ? responsiveImage(post.cover_image_url, 640, large ? FEATURE_WIDTHS : CARD_IMAGE_WIDTHS)
    : null;
  return (
    <div className={`overflow-hidden bg-[#f1e9ff] ${className}`}>
      {image && (
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={image.srcSet ? sizes : undefined}
          alt=""
          width={640}
          height={320}
          loading={index < EAGER_CARD_COUNT ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : undefined}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      )}
    </div>
  );
}

function useListState() {
  // Remember which list page/filter the reader came from, for the post page's back link.
  const { search } = useLocation();
  return { listSearch: search };
}

function FeatureCard({ post }: { post: BlogCardPost }) {
  const state = useListState();
  return (
    <Link to={`/blog/${post.slug}`} state={state} data-testid="blog-card" className="group block text-inherit no-underline">
      <Cover post={post} index={0} large sizes={FEATURE_SIZES} className="aspect-[16/9] rounded-[14px] lg:aspect-[2.4/1]" />
      <h2 className="m-0 mt-5 font-serif text-[30px] font-normal leading-[1.1] tracking-[-0.02em] group-hover:underline lg:mt-7 lg:text-[46px] lg:leading-[1.08]">
        {post.title}
      </h2>
      {post.excerpt && (
        <p className="m-0 mt-3 max-w-[760px] text-[16px] leading-[1.55] text-ink-muted lg:mt-3.5 lg:text-[18px]">{post.excerpt}</p>
      )}
      <Byline post={post} />
    </Link>
  );
}

function LatestCard({ post, index }: { post: BlogCardPost; index: number }) {
  const state = useListState();
  return (
    <Link to={`/blog/${post.slug}`} state={state} data-testid="blog-card" className="group block w-[280px] flex-none text-inherit no-underline lg:w-auto">
      <Cover post={post} index={index} sizes={LATEST_SIZES} className="h-[180px] rounded-xl lg:h-[210px]" />
      <h3 className="m-0 mt-3.5 font-serif text-[21px] font-normal leading-[1.2] tracking-[-0.01em] group-hover:underline lg:mt-[18px] lg:text-[24px] lg:leading-[1.18]">
        {post.title}
      </h3>
      {post.excerpt && (
        <p className="m-0 mt-2 line-clamp-3 text-[14px] leading-[1.5] text-ink-muted lg:mt-2.5 lg:text-[15px] lg:leading-[1.55]">{post.excerpt}</p>
      )}
      <Byline post={post} />
    </Link>
  );
}

function PostRow({ post, index }: { post: BlogCardPost; index: number }) {
  const state = useListState();
  return (
    <Link to={`/blog/${post.slug}`} state={state} data-testid="blog-card" className="group flex items-start gap-4 text-inherit no-underline sm:gap-7">
      <Cover post={post} index={index} sizes={ROW_SIZES} className="h-[84px] w-[120px] flex-none rounded-[10px] sm:h-[126px] sm:w-[190px]" />
      <div className="min-w-0">
        <h3 className="m-0 font-serif text-[19px] font-normal leading-[1.2] tracking-[-0.01em] group-hover:underline sm:text-[26px] sm:leading-[1.18]">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="m-0 mt-2 line-clamp-2 hidden text-[15px] leading-[1.5] text-ink-muted sm:[display:-webkit-box]">{post.excerpt}</p>
        )}
        <Byline post={post} />
      </div>
    </Link>
  );
}

function Pagination({ page, totalPages, category }: {
  page: number;
  totalPages: number;
  category: BlogCategory | 'all';
}) {
  const href = (p: number) => ({ pathname: '/blog', search: searchFor(p, category) });
  const prefetch = (p: number) => () => { void prefetchPublicBlogPage(p, category); };
  const circle = 'flex h-11 w-11 items-center justify-center rounded-full border border-solid text-[14px] no-underline transition-colors';
  const pill = 'flex h-11 items-center rounded-full border border-solid px-4 text-[14px] no-underline transition-colors';
  const idle = 'border-hairline bg-white text-ink-strong hover:border-brand hover:text-brand';
  const disabled = 'border-hairline bg-transparent text-ink-muted pointer-events-none';

  return (
    <nav aria-label="Blog pages" className="mt-16 flex flex-wrap items-center gap-2 lg:mt-[72px]">
      {page > 1 ? (
        <Link to={href(page - 1)} rel="prev" onMouseEnter={prefetch(page - 1)} onFocus={prefetch(page - 1)} className={`${pill} ${idle}`}>
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={`${pill} ${disabled}`}>Previous</span>
      )}

      {pageNumbers(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-[14px] text-ink-muted">…</span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={`${circle} border-brand bg-brand font-semibold text-white`}>
            {p}
          </span>
        ) : (
          <Link key={p} to={href(p)} aria-label={`Page ${p}`} onMouseEnter={prefetch(p)} onFocus={prefetch(p)} className={`${circle} ${idle}`}>
            {p}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link to={href(page + 1)} rel="next" onMouseEnter={prefetch(page + 1)} onFocus={prefetch(page + 1)} className={`${pill} ${idle}`}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={`${pill} ${disabled}`}>Next</span>
      )}
    </nav>
  );
}

function PostCardSkeleton() {
  return (
    <div data-testid="blog-card-skeleton" className="flex animate-pulse items-start gap-4 sm:gap-7">
      <div className="h-[84px] w-[120px] flex-none rounded-[10px] bg-[#f3f0f8] sm:h-[126px] sm:w-[190px]" />
      <div className="flex-1">
        <div className="h-5 w-3/4 rounded bg-[#f3f0f8]" />
        <div className="mt-3 h-3.5 w-full rounded bg-[#f3f0f8]" />
        <div className="mt-2 h-3.5 w-2/3 rounded bg-[#f3f0f8]" />
      </div>
    </div>
  );
}
