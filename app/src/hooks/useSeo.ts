import { useEffect } from 'react';
import { canonicalUrl } from '../lib/site';

// Client-side per-page SEO: document.title, meta description, canonical link,
// and Open Graph / Twitter Card tags. This runs after React renders, so it
// helps real browsers and JS-executing crawlers (Google) but - same caveat
// as the rest of this app's public pages - not simple/non-JS crawlers,
// which only ever see the static baseline tags in index.html.

interface SeoOptions {
  title: string;
  description?: string;
  /** Path only, e.g. "/blog/my-post" - the origin comes from lib/site.ts. */
  path?: string;
  image?: string;
  type?: 'website' | 'article';
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useSeo({ title, description, path, image, type = 'website' }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.endsWith('Shorty Harris') ? title : `${title} - Shorty Harris`;
    document.title = fullTitle;

    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('property', 'og:type', type);

    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
      upsertMeta('name', 'twitter:description', description);
    }

    // A noindex left behind by another screen must not outlive it on an
    // indexable page.
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots && /noindex/i.test(robots.content)) robots.remove();

    if (path) {
      const url = canonicalUrl(path);
      upsertLink('canonical', url);
      upsertMeta('property', 'og:url', url);
    }

    if (image) {
      upsertMeta('property', 'og:image', image);
      upsertMeta('name', 'twitter:image', image);
      upsertMeta('name', 'twitter:card', 'summary_large_image');
    }
  }, [title, description, path, image, type]);
}
