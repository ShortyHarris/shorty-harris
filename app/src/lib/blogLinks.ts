// PostKing/CMS bodies sometimes carry links like `](internal_link:some-slug)`
// (placeholder never expanded). Rewrite them to real `/blog/{slug}` links so
// rendered HTML, the sitemap and crawlers never see the literal prefix.
const INTERNAL_LINK_RE = /(?:https?:\/\/[^/\s"'()<>]+)?(?:\/blog\/)?internal_link(?::|%3A)\/?(?:blog\/)?([a-z0-9][a-z0-9-]*)/gi;

export function expandInternalLinks(body: string): string {
  return body.replace(INTERNAL_LINK_RE, (_m, slug: string) => `/blog/${slug.toLowerCase()}`);
}

export function hasInternalLink(text: string): boolean {
  return /internal_link/i.test(text);
}
