import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { Calendar } from 'lucide-react';
import { PublicNav } from '../components/PublicNav';
import { PublicFooter } from '../components/PublicFooter';
import { useSeo } from '../hooks/useSeo';
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

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

export function BlogPost() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { post, loading, error } = useBlogPost(slug);
  const [related, setRelated] = useState<LinkedPost[]>([]);

  useEffect(() => {
    if (!post) return;
    fetchLinkedPosts(post.id).then(setRelated).catch(() => setRelated([]));
  }, [post]);

  useSeo({
    title: post?.seo_title || post?.title || 'Blog post',
    description: post?.meta_description || post?.excerpt || undefined,
    path: post ? `/blog/${post.slug}` : undefined,
    image: post?.cover_image_url || undefined,
    type: 'article',
  });

  if (loading) {
    return (
      <div style={FONT} className="min-h-screen bg-white">
        <PublicNav />
        <div className="max-w-[680px] mx-auto px-6 py-24">
          <div className="h-4 w-24 animate-pulse rounded-full bg-[#f0ede6]" />
          <div className="mt-4 h-9 w-full animate-pulse rounded-lg bg-[#f0ede6]" />
          <div className="mt-2 h-9 w-2/3 animate-pulse rounded-lg bg-[#f0ede6]" />
          <div className="mt-10 aspect-[16/9] w-full animate-pulse rounded-2xl bg-[#f0ede6]" />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (!post) {
    return (
      <div style={FONT} className="min-h-screen bg-white text-[#1a1b17]">
        <PublicNav />
        <main className="max-w-[680px] mx-auto px-6 py-24 text-center">
          <h1 className="m-0 text-[22px] font-extrabold">Post not found</h1>
          {error && <p className="mt-2 text-[13px] text-[#a8533a]">{error}</p>}
          <Link to="/blog" className="mt-4 inline-block text-[13px] font-semibold text-[#3c7a5b] no-underline hover:underline">
            ← Back to all posts
          </Link>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    image: post.cover_image_url ? [post.cover_image_url] : undefined,
    datePublished: post.published_at ?? undefined,
    author: { '@type': 'Person', name: post.author || 'Shorty Harris' },
    description: post.meta_description || post.excerpt || undefined,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${window.location.origin}/blog/${post.slug}` },
  };

  return (
    <div style={FONT} className="min-h-screen bg-white text-[#1a1b17]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicNav />

      <main className="max-w-[680px] mx-auto px-6 pt-14 pb-24">
        <span className="text-[12.5px] font-bold uppercase tracking-[.1em] text-[#3c7a5b]">
          {CATEGORY_LABEL[post.category] ?? post.category}
        </span>

        <h1 className="mt-4 mb-0 text-[30px] sm:text-[38px] lg:text-[44px] font-extrabold leading-[1.15] tracking-tight">
          {post.title}
        </h1>

        {post.excerpt && (
          <p className="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-[#54574e]">{post.excerpt}</p>
        )}

        <div className="mt-8 flex items-center gap-3 border-y border-[#ece8df] py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf4ef] text-[13px] font-bold text-[#3c7a5b]">
            {initials(post.author || 'Shorty Harris')}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13.5px] font-semibold text-[#1a1b17]">{post.author || 'Shorty Harris'}</span>
            <span className="flex items-center gap-1 text-[12.5px] text-[#9a9d92]">
              <Calendar size={11.5} strokeWidth={2} />
              {formatDate(post.published_at)}
            </span>
          </div>
        </div>

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt={post.title}
            width={1200}
            height={630}
            fetchPriority="high"
            className="mt-10 aspect-[1200/630] w-full rounded-2xl bg-[#f0ede6] object-cover"
          />
        )}

        <style>{`
          .blog-post-body { font-size: 17px; line-height: 1.85; color: #262620; margin-top: 44px; }
          .blog-post-body h2 { font-size: 26px; font-weight: 800; margin: 52px 0 18px; letter-spacing: -0.015em; line-height: 1.3; }
          .blog-post-body h3 { font-size: 21px; font-weight: 700; margin: 40px 0 14px; letter-spacing: -0.01em; }
          .blog-post-body p { margin: 0 0 26px; }
          .blog-post-body ul, .blog-post-body ol { margin: 0 0 26px; padding-left: 24px; }
          .blog-post-body li { margin-bottom: 8px; }
          .blog-post-body a { color: #3c7a5b; text-decoration: underline; text-underline-offset: 2px; }
          .blog-post-body strong { font-weight: 700; color: #1a1b17; }
          .blog-post-body img { max-width: 100%; border-radius: 12px; margin: 8px 0 26px; }
          .blog-post-body blockquote {
            margin: 32px 0; padding: 4px 0 4px 22px; border-left: 3px solid #3c7a5b;
            font-size: 19px; font-style: italic; color: #3f4038; line-height: 1.6;
          }
          .blog-post-body blockquote p { margin: 0; }
          .blog-post-body hr { border: none; border-top: 1px solid #ece8df; margin: 44px 0; }
        `}</style>
        <div
          className="blog-post-body"
          dangerouslySetInnerHTML={{ __html: marked.parse(post.body_md || '') as string }}
        />

        {related.length > 0 && (
          <div className="mt-20 border-t border-[#ece8df] pt-10">
            <h2 className="m-0 mb-6 text-[13px] font-bold uppercase tracking-[.08em] text-[#9a9d92]">
              Keep reading
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/blog/${r.slug}`}
                  className="flex flex-col no-underline text-inherit group"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#f0ede6]">
                    {r.cover_image_url && (
                      <img
                        src={r.cover_image_url}
                        alt={r.title}
                        width={400}
                        height={300}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    )}
                  </div>
                  <span className="mt-3 text-[14.5px] font-bold leading-snug text-[#1a1b17] transition-colors group-hover:text-[#3c7a5b]">
                    {r.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
