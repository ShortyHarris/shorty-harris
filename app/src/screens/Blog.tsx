import { useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Calendar, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { responsiveImage } from '../lib/supabaseImage';

const CATEGORY_LABEL: Record<BlogCategory, string> = {
  family_business: 'Family Business',
  small_business: 'Small Business',
  business_development_rural: 'Rural Business Development',
  general: 'General',
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

// Cards sit in a 1 / 2 / 3 column grid (sm / lg breakpoints).
const CARD_SIZES = '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw';
// The first row is above the fold on desktop - load it straight away.
const EAGER_CARD_COUNT = 3;

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

  const pillClass = (active: boolean) =>
    // Same pill language as the public nav: beige + dark text when active.
    `cursor-pointer rounded-full border h-9 px-4 text-[13.5px] transition-colors ${
      active
        ? 'border-[#e5e5e5] bg-[#f0f0f0] text-[#0a0a0a] font-semibold'
        : 'border-[#e5e5e5] bg-white text-[#525252] font-medium hover:bg-[#f5f5f5] hover:text-[#0a0a0a]'
    }`;

  return (
    <div style={FONT} className="min-h-screen flex flex-col bg-cream text-[#0a0a0a]">
      <PublicNav />

      <main className="max-w-[1160px] mx-auto px-6 py-20">
        {/* Centered eyebrow + heading + divider */}
        <div className="mx-auto max-w-[640px] text-center">
          <span className="text-[12px] font-bold uppercase tracking-[.14em] text-[#3c7a5b]">Our Blog</span>
          <h1 className="mt-3 mb-0 text-[34px] sm:text-[40px] font-extrabold leading-[1.15] tracking-tight text-[#0a0a0a]">
            Practical advice for growing your small or family business
          </h1>
          <div className="mx-auto mt-8 h-px w-16 bg-[#d4d4d4]" />
        </div>

        {/* Category filter pills */}
        {categories.length > 1 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => selectCategory('all')}
              onMouseEnter={() => prefetchPublicBlogPage(1, 'all')}
              className={pillClass(activeCategory === 'all')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => selectCategory(c)}
                onMouseEnter={() => prefetchPublicBlogPage(1, c)}
                className={pillClass(activeCategory === c)}
              >
                {CATEGORY_LABEL[c] ?? c}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-10 rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
        )}

        {loading ? (
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {Array.from({ length: BLOG_PAGE_SIZE }).map((_, i) => <PostCardSkeleton key={i} />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="mt-14 rounded-2xl border border-dashed border-[#e5e5e5] bg-white p-10 text-center text-[13px] text-[#525252]">
            {activeCategory === 'all' ? 'Nothing published yet - check back soon.' : 'No posts in this category yet.'}
          </div>
        ) : (
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {posts.map((post, i) => <PostCard key={post.id} post={post} index={i} />)}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} category={activeCategory} />
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function PostCard({ post, index }: { post: BlogCardPost; index: number }) {
  // Remember which list page/filter the reader came from, for the post page's back link.
  const { search } = useLocation();
  const eager = index < EAGER_CARD_COUNT;
  const image = post.cover_image_url ? responsiveImage(post.cover_image_url, 640) : null;
  return (
    <Link
      to={`/blog/${post.slug}`}
      state={{ listSearch: search }}
      data-testid="blog-card"
      className="flex flex-col no-underline border pb-4 bg-white border-gray-200 text-inherit group"
    >
      {/* Fixed 2:1 box with a light placeholder colour, so nothing jumps while the image loads */}
      <div className="aspect-[2/1] w-full overflow-hidden bg-[#f5f5f5]">
        {image && (
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes={image.srcSet ? CARD_SIZES : undefined}
            alt={post.title}
            width={640}
            height={320}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : undefined}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col pt-5 px-4">
        <span className="text-[12.5px] font-bold text-[#3c7a5b]">
          {CATEGORY_LABEL[post.category] ?? post.category}
        </span>
        <span className="mt-1.5 text-[16px] font-bold leading-snug text-[#0a0a0a] transition-colors group-hover:text-[#3c7a5b]">
          {post.title}
        </span>
        {post.excerpt && (
          <span className="mt-2 text-[13.5px] leading-relaxed text-[#525252] line-clamp-3">{post.excerpt}</span>
        )}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#e5e5e5] pt-4">
          <span className="flex items-center gap-1.5 text-[12px] text-[#737373]">
            <Calendar size={13} strokeWidth={2} />
            {formatDate(post.published_at)}
          </span>
          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-[#3c7a5b]">
            Read article
            <ArrowRight size={13} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
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
  const base = 'flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-3 text-[13px] font-semibold no-underline transition-colors';
  const idle = 'border-[#e5e5e5] bg-white text-[#525252] hover:border-[#3c7a5b] hover:text-[#3c7a5b]';
  const disabled = 'border-[#e5e5e5] bg-transparent text-[#a3a3a3] pointer-events-none';

  return (
    <nav aria-label="Blog pages" className="mt-16 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link
          to={href(page - 1)}
          rel="prev"
          onMouseEnter={prefetch(page - 1)}
          onFocus={prefetch(page - 1)}
          className={`${base} ${idle}`}
        >
          <ChevronLeft size={14} strokeWidth={2.2} /> Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={`${base} ${disabled}`}>
          <ChevronLeft size={14} strokeWidth={2.2} /> Previous
        </span>
      )}

      {pageNumbers(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-[13px] text-[#737373]">…</span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={`${base} border-[#3c7a5b] bg-[#3c7a5b] text-white`}>
            {p}
          </span>
        ) : (
          <Link
            key={p}
            to={href(p)}
            aria-label={`Page ${p}`}
            onMouseEnter={prefetch(p)}
            onFocus={prefetch(p)}
            className={`${base} ${idle}`}
          >
            {p}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link
          to={href(page + 1)}
          rel="next"
          onMouseEnter={prefetch(page + 1)}
          onFocus={prefetch(page + 1)}
          className={`${base} ${idle}`}
        >
          Next <ChevronRight size={14} strokeWidth={2.2} />
        </Link>
      ) : (
        <span aria-disabled="true" className={`${base} ${disabled}`}>
          Next <ChevronRight size={14} strokeWidth={2.2} />
        </span>
      )}
    </nav>
  );
}

function PostCardSkeleton() {
  return (
    <div data-testid="blog-card-skeleton" className="flex flex-col border pb-4 bg-white border-gray-200 animate-pulse">
      <div className="aspect-[2/1] w-full bg-[#f5f5f5]" />
      <div className="flex flex-1 flex-col pt-5 px-4">
        <div className="h-3 w-20 rounded bg-[#f5f5f5]" />
        <div className="mt-2.5 h-4 w-full rounded bg-[#f5f5f5]" />
        <div className="mt-1.5 h-4 w-2/3 rounded bg-[#f5f5f5]" />
        <div className="mt-3 h-3 w-full rounded bg-[#f5f5f5]" />
        <div className="mt-1.5 h-3 w-4/5 rounded bg-[#f5f5f5]" />
        <div className="mt-4 flex items-center justify-between border-t border-[#e5e5e5] pt-4">
          <div className="h-3 w-16 rounded bg-[#f5f5f5]" />
          <div className="h-3 w-14 rounded bg-[#f5f5f5]" />
        </div>
      </div>
    </div>
  );
}
