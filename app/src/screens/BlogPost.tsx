import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { useBlogPost, fetchLinkedPosts } from '../hooks/useBlogPosts';
import type { BlogCategory, LinkedPost } from '../hooks/useBlogPosts';

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

export function BlogPost() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { post, loading, error } = useBlogPost(slug);
  const [related, setRelated] = useState<LinkedPost[]>([]);

  useEffect(() => {
    if (!post) return;
    fetchLinkedPosts(post.id).then(setRelated).catch(() => setRelated([]));
  }, [post]);

  useEffect(() => {
    if (post) document.title = post.seo_title || post.title;
  }, [post]);

  if (loading) {
    return (
      <div style={FONT} className="min-h-screen bg-[#f7f4ee]">
        <div className="max-w-[720px] mx-auto px-6 py-20 text-center text-[13px] text-[#9a9d92]">Loading…</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div style={FONT} className="min-h-screen bg-[#f7f4ee] text-[#1a1b17]">
        <main className="max-w-[720px] mx-auto px-6 py-20 text-center">
          <h1 className="m-0 text-[22px] font-extrabold">Post not found</h1>
          {error && <p className="mt-2 text-[13px] text-[#a8533a]">{error}</p>}
          <Link to="/blog" className="mt-4 inline-block text-[13px] font-semibold text-[#3c7a5b] no-underline hover:underline">
            ← Back to all posts
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div style={FONT} className="min-h-screen bg-[#f7f4ee] text-[#1a1b17]">
      <header className="border-b border-[#e5ddd3] bg-white">
        <div className="max-w-[720px] mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="text-[18px] tracking-tight leading-none no-underline">
            <span className="font-medium text-[#54574e]">Shorty</span>
            <span className="font-extrabold text-[#1a1b17]"> Harris</span>
          </Link>
          <Link to="/blog" className="text-[13px] font-semibold text-[#54574e] no-underline hover:text-[#3c7a5b] transition-colors">
            ← All posts
          </Link>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-6 py-12">
        <span className="w-fit rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em] text-[#3c7a5b]">
          {CATEGORY_LABEL[post.category] ?? post.category}
        </span>
        <h1 className="mt-3 mb-2 text-[32px] font-extrabold leading-tight tracking-tight">{post.title}</h1>
        <div className="mb-6 flex items-center gap-2 text-[13px] text-[#9a9d92]">
          <span>{post.author || 'Shorty Harris'}</span>
          <span>·</span>
          <span>{formatDate(post.published_at)}</span>
        </div>

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt={post.title}
            width={1200}
            height={630}
            className="mb-8 aspect-[1200/630] w-full rounded-2xl bg-[#f0ede6] object-cover"
          />
        )}

        <style>{`
          .blog-post-body { font-size: 16px; line-height: 1.75; color: #1a1b17; }
          .blog-post-body h2 { font-size: 24px; font-weight: 800; margin: 36px 0 14px; letter-spacing: -0.01em; }
          .blog-post-body h3 { font-size: 19px; font-weight: 700; margin: 28px 0 12px; }
          .blog-post-body p { margin: 0 0 18px; }
          .blog-post-body ul, .blog-post-body ol { margin: 0 0 18px; padding-left: 22px; }
          .blog-post-body a { color: #3c7a5b; }
          .blog-post-body img { max-width: 100%; border-radius: 10px; }
        `}</style>
        <div
          className="blog-post-body"
          dangerouslySetInnerHTML={{ __html: marked.parse(post.body_md || '') as string }}
        />

        {related.length > 0 && (
          <div className="mt-14 border-t border-[#e5ddd3] pt-8">
            <h2 className="m-0 mb-4 text-[18px] font-bold">Related posts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/blog/${r.slug}`}
                  className="rounded-xl border border-[#ece8df] bg-white p-4 text-[13px] font-semibold no-underline text-inherit hover:border-[#3c7a5b] transition-colors"
                >
                  {r.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
