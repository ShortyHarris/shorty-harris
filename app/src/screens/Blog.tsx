import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ArrowRight } from 'lucide-react';
import { PublicNav } from '../components/PublicNav';
import { PublicFooter } from '../components/PublicFooter';
import { useSeo } from '../hooks/useSeo';
import { usePublishedBlogPosts } from '../hooks/useBlogPosts';
import type { BlogCategory } from '../hooks/useBlogPosts';

const CATEGORY_LABEL: Record<BlogCategory, string> = {
  family_business: 'Family Business',
  small_business: 'Small Business',
  business_development_rural: 'Rural Business Development',
  general: 'General',
};

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Blog() {
  useSeo({
    title: 'Blog',
    description: 'Practical advice for growing your small or family business — outreach strategy, local business development, and growth tips.',
    path: '/blog',
  });

  const { posts, loading, error } = usePublishedBlogPosts();
  const [activeCategory, setActiveCategory] = useState<BlogCategory | 'all'>('all');

  const categories = useMemo(
    () => Array.from(new Set(posts.map((p) => p.category))),
    [posts],
  );
  const filteredPosts = activeCategory === 'all'
    ? posts
    : posts.filter((p) => p.category === activeCategory);

  return (
    <div style={FONT} className="min-h-screen bg-[#f7f4ee] text-[#1a1b17]">
      <PublicNav />

      <main className="max-w-[1160px] mx-auto px-6 py-20">
        {/* Centered eyebrow + heading + divider */}
        <div className="mx-auto max-w-[640px] text-center">
          <span className="text-[12px] font-bold uppercase tracking-[.14em] text-[#3c7a5b]">Our Blog</span>
          <h1 className="mt-3 mb-0 text-[34px] sm:text-[40px] font-extrabold leading-[1.15] tracking-tight text-[#1a1b17]">
            Practical advice for growing your small or family business
          </h1>
          <div className="mx-auto mt-8 h-px w-16 bg-[#d8d2c5]" />
        </div>

        {/* Category filter pills */}
        {categories.length > 1 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                activeCategory === 'all'
                  ? 'border-[#3c7a5b] bg-[#3c7a5b] text-white'
                  : 'border-[#e5ddd3] bg-white text-[#54574e] hover:border-[#3c7a5b] hover:text-[#3c7a5b]'
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  activeCategory === c
                    ? 'border-[#3c7a5b] bg-[#3c7a5b] text-white'
                    : 'border-[#e5ddd3] bg-white text-[#54574e] hover:border-[#3c7a5b] hover:text-[#3c7a5b]'
                }`}
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
            {Array.from({ length: 6 }).map((_, i) => <PostCardSkeleton key={i} />)}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="mt-14 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center text-[13px] text-[#62655c]">
            {posts.length === 0 ? 'Nothing published yet — check back soon.' : 'No posts in this category yet.'}
          </div>
        ) : (
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {filteredPosts.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="flex flex-col no-underline border pb-4 bg-white border-gray-200 text-inherit group"
              >
                <div className="aspect-[4/2] w-full overflow-hidden  bg-[#f0ede6]">
                  {post.cover_image_url && (
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      width={800}
                      height={400}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col pt-5 px-4">
                  <span className="text-[12.5px] font-bold text-[#3c7a5b]">
                    {CATEGORY_LABEL[post.category] ?? post.category}
                  </span>
                  <span className="mt-1.5 text-[16px] font-bold leading-snug text-[#1a1b17] transition-colors group-hover:text-[#3c7a5b]">
                    {post.title}
                  </span>
                  {post.excerpt && (
                    <span className="mt-2 text-[13.5px] leading-relaxed text-[#62655c] line-clamp-3">{post.excerpt}</span>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#ece8df] pt-4">
                    <span className="flex items-center gap-1.5 text-[12px] text-[#9a9d92]">
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
            ))}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

function PostCardSkeleton() {
  return (
    <div className="flex flex-col border pb-4 bg-white border-gray-200 animate-pulse">
      <div className="aspect-4/2 w-full bg-[#f0ede6]" />
      <div className="flex flex-1 flex-col pt-5 px-4">
        <div className="h-3 w-20 rounded bg-[#f0ede6]" />
        <div className="mt-2.5 h-4 w-full rounded bg-[#f0ede6]" />
        <div className="mt-1.5 h-4 w-2/3 rounded bg-[#f0ede6]" />
        <div className="mt-3 h-3 w-full rounded bg-[#f5f2ec]" />
        <div className="mt-1.5 h-3 w-4/5 rounded bg-[#f5f2ec]" />
        <div className="mt-4 flex items-center justify-between border-t border-[#ece8df] pt-4">
          <div className="h-3 w-16 rounded bg-[#f0ede6]" />
          <div className="h-3 w-14 rounded bg-[#f0ede6]" />
        </div>
      </div>
    </div>
  );
}
