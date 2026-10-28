import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { ArrowLeft } from 'lucide-react';
import { PublicNav } from '../components/PublicNav';
import { PublicFooter } from '../components/PublicFooter';
import { useSeo } from '../hooks/useSeo';
import { useBlogPost, fetchLinkedPosts } from '../hooks/useBlogPosts';
import type { BlogCategory, LinkedPost } from '../hooks/useBlogPosts';
import { responsiveImage } from '../lib/supabaseImage';
import { expandInternalLinks, hasInternalLink } from '../lib/blogLinks';
import { canonicalUrl } from '../lib/site';

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

// ~220 words a minute, never less than one.
function readingMinutes(md: string | null | undefined): number {
  const words = (md ?? '').replace(/[#>*_`[\]()!-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function BlogPost() {
  const { slug = '' } = useParams<{ slug: string }>();
  const listSearch = (useLocation().state as { listSearch?: string } | null)?.listSearch ?? '';
  const { post, loading, error } = useBlogPost(slug);
  const [related, setRelated] = useState<LinkedPost[]>([]);

  useEffect(() => {
    if (!post) return;
    fetchLinkedPosts(post.id, { liveOnly: true }).then(setRelated).catch(() => setRelated([]));
  }, [post]);

  useSeo({
    title: post?.seo_title || post?.title || 'Blog post',
    description: post?.meta_description || post?.excerpt || undefined,
    path: post ? `/blog/${post.slug}` : undefined,
    image: post?.cover_image_url || undefined,
    type: 'article',
  });

  // Bare-slug redirects (vercel.json) can land here for non-posts: keep those
  // out of the index.
  useEffect(() => {
    if (loading || post) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [loading, post]);

  // Old links like /blog/internal_link:some-slug: send to the real post.
  if (hasInternalLink(slug)) {
    return <Navigate to={expandInternalLinks(`/blog/${slug}`)} replace />;
  }

  if (loading) {
    return (
      <div style={FONT} className="min-h-screen flex flex-col bg-paper">
        <PublicNav />
        <div className="max-w-[680px] mx-auto px-6 py-24">
          <div className="h-4 w-24 animate-pulse rounded-full bg-[#f5f5f5]" />
          <div className="mt-4 h-9 w-full animate-pulse rounded-lg bg-[#f5f5f5]" />
          <div className="mt-2 h-9 w-2/3 animate-pulse rounded-lg bg-[#f5f5f5]" />
          <div className="mt-10 aspect-[16/9] w-full animate-pulse rounded-2xl bg-[#f5f5f5]" />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (!post) {
    return (
      <div style={FONT} className="min-h-screen flex flex-col bg-paper text-[#0e0822]">
        <PublicNav />
        <main className="max-w-[680px] mx-auto px-6 py-24 text-center">
          <h1 className="m-0 text-[22px] font-extrabold">Post not found</h1>
          {error && <p className="mt-2 text-[13px] text-[#a8533a]">{error}</p>}
          <Link to="/blog" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#7412ef] no-underline hover:underline">
            <ArrowLeft size={14} strokeWidth={2.4} /> Back to all posts
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
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(`/blog/${post.slug}`) },
  };

  return (
    <div style={FONT} className="min-h-screen flex flex-col bg-paper text-[#0e0822]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicNav />

      <main className="max-w-[680px] mx-auto px-6 pt-10 pb-24">
        <Link
          to={`/blog${listSearch}`}
          className="group mb-8 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#605978] no-underline transition-colors hover:text-[#7412ef]"
        >
          <ArrowLeft size={14} strokeWidth={2.2} className="transition-transform group-hover:-translate-x-0.5" />
          All posts
        </Link>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
          <span className="font-semibold uppercase tracking-[.1em] text-[#7412ef]">
            {CATEGORY_LABEL[post.category] ?? post.category}
          </span>
          {post.published_at && (
            <>
              <span aria-hidden="true" className="text-[#a3a3a3]">·</span>
              <time dateTime={post.published_at} className="font-medium text-[#605978]">
                {formatDate(post.published_at)}
              </time>
            </>
          )}
          <span aria-hidden="true" className="text-[#a3a3a3]">·</span>
          <span className="font-medium text-[#605978]">{readingMinutes(post.body_md)} min read</span>
        </div>

        <h1 className="mt-4 mb-0 text-[30px] sm:text-[38px] lg:text-[44px] font-extrabold leading-[1.15] tracking-tight">
          {post.title}
        </h1>

        {post.excerpt && (
          <p className="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-[#605978]">{post.excerpt}</p>
        )}

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt={post.title}
            width={1200}
            height={630}
            fetchPriority="high"
            className="mt-10 aspect-[1200/630] w-full rounded-2xl bg-[#f5f5f5] object-cover"
          />
        )}

        <style>{`
          .blog-post-body { font-size: 17px; line-height: 1.85; color: #171717; margin-top: 44px; }
          .blog-post-body h2 { font-size: 26px; font-weight: 800; margin: 52px 0 18px; letter-spacing: -0.015em; line-height: 1.3; }
          .blog-post-body h3 { font-size: 21px; font-weight: 600; margin: 40px 0 14px; letter-spacing: -0.01em; }
          .blog-post-body p { margin: 0 0 26px; }
          .blog-post-body ul, .blog-post-body ol { margin: 0 0 26px; padding-left: 24px; }
          .blog-post-body li { margin-bottom: 8px; }
          .blog-post-body a { color: #7412ef; text-decoration: underline; text-underline-offset: 2px; }
          .blog-post-body strong { font-weight: 600; color: #0e0822; }
          .blog-post-body img { max-width: 100%; border-radius: 12px; margin: 8px 0 26px; }
          .blog-post-body blockquote {
            margin: 32px 0; padding: 4px 0 4px 22px; border-left: 3px solid #7412ef;
            font-size: 19px; font-style: italic; color: #404040; line-height: 1.6;
          }
          .blog-post-body blockquote p { margin: 0; }
          .blog-post-body hr { border: none; border-top: 1px solid #e8e3f7; margin: 44px 0; }
        `}</style>
        <div
          className="blog-post-body"
          dangerouslySetInnerHTML={{ __html: marked.parse(expandInternalLinks(post.body_md || '')) as string }}
        />

        {/* Turn a finished read into a next step */}
        <aside className="mt-16 rounded-2xl bg-[#0e0822] px-7 py-9 sm:px-10 text-center"
          style={{ background: 'radial-gradient(60% 90% at 50% 0%, rgba(168,120,255,0.30) 0%, transparent 100%), #0e0822' }}
        >
          <h2 className="m-0 text-[22px] sm:text-[26px] font-extrabold tracking-[-0.02em] text-white">
            Want warm leads without the cold outreach?
          </h2>
          <p className="mx-auto mt-3 mb-6 max-w-[440px] text-[15px] leading-[1.6] text-white/70">
            Shorty Harris finds local businesses, writes and sends the emails, and only hands you the ones who reply with interest.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-white text-[#0e0822] text-[14.5px] font-semibold no-underline hover:bg-[#f1e9ff] transition-colors"
            >
              Get started
            </Link>
            <a
              href="/#how"
              className="inline-flex items-center justify-center h-11 px-6 rounded-full border border-white/25 text-white text-[14.5px] font-semibold no-underline hover:bg-white/10 transition-colors"
            >
              How it works
            </a>
          </div>
        </aside>

        {related.length > 0 && (
          <div className="mt-16 border-t border-[#e8e3f7] pt-10">
            <h2 className="m-0 mb-6 text-[13px] font-semibold uppercase tracking-[.08em] text-[#605978]">
              Keep reading
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/blog/${r.slug}`}
                  className="flex flex-col no-underline text-inherit group"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#f5f5f5]">
                    {r.cover_image_url && (
                      <img
                        {...responsiveImage(r.cover_image_url, 400, [400, 640])}
                        sizes="(min-width:640px) 210px, 100vw"
                        alt={r.title}
                        width={400}
                        height={300}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    )}
                  </div>
                  <span className="mt-3 text-[14.5px] font-semibold leading-snug text-[#0e0822] transition-colors group-hover:text-[#7412ef]">
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
