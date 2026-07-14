import { Link } from 'react-router-dom';
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
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function Blog() {
  const { posts, loading, error } = usePublishedBlogPosts();

  return (
    <div style={FONT} className="min-h-screen bg-[#f7f4ee] text-[#1a1b17]">
      <header className="border-b border-[#e5ddd3] bg-white">
        <div className="max-w-[880px] mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="text-[18px] tracking-tight leading-none no-underline">
            <span className="font-medium text-[#54574e]">Shorty</span>
            <span className="font-extrabold text-[#1a1b17]"> Harris</span>
          </Link>
          <Link to="/" className="text-[13px] font-semibold text-[#54574e] no-underline hover:text-[#3c7a5b] transition-colors">
            ← Home
          </Link>
        </div>
      </header>

      <main className="max-w-[880px] mx-auto px-6 py-12">
        <h1 className="m-0 text-[32px] font-extrabold tracking-tight">Blog</h1>
        <p className="mt-2 mb-10 text-[14px] text-[#62655c]">Insights on running and growing a small or family business.</p>

        {error && (
          <div className="rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl border border-[#ece8df] bg-white" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center text-[13px] text-[#62655c]">
            Nothing published yet — check back soon.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {posts.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="flex flex-col overflow-hidden rounded-2xl border border-[#ece8df] bg-white no-underline text-inherit transition-shadow hover:shadow-[0_8px_28px_rgba(32,33,28,0.08)]"
              >
                <div className="aspect-[1200/630] w-full bg-[#f0ede6]">
                  {post.cover_image_url && (
                    <img src={post.cover_image_url} alt={post.title} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex flex-col gap-2 p-5">
                  <span className="w-fit rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em] text-[#3c7a5b]">
                    {CATEGORY_LABEL[post.category] ?? post.category}
                  </span>
                  <span className="text-[16px] font-bold leading-snug">{post.title}</span>
                  {post.excerpt && <span className="text-[13px] leading-relaxed text-[#62655c] line-clamp-2">{post.excerpt}</span>}
                  <span className="mt-auto text-[11.5px] text-[#9a9d92]">{formatDate(post.published_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
