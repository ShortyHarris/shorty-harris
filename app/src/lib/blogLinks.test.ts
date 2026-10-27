import { describe, expect, it } from 'vitest';
import { expandInternalLinks, hasInternalLink } from './blogLinks';

describe('expandInternalLinks', () => {
  it('rewrites markdown and html hrefs', () => {
    expect(expandInternalLinks('[a](internal_link:family-business-second-generation-succession)'))
      .toBe('[a](/blog/family-business-second-generation-succession)');
    expect(expandInternalLinks('<a href="internal_link:x-y">a</a>')).toBe('<a href="/blog/x-y">a</a>');
  });

  it('handles /blog/ prefixes, absolute hosts and encoded colons', () => {
    expect(expandInternalLinks('[a](/blog/internal_link:foo)')).toBe('[a](/blog/foo)');
    expect(expandInternalLinks('[a](https://www.shortyharris.com/blog/internal_link:foo)')).toBe('[a](/blog/foo)');
    expect(expandInternalLinks('[a](internal_link%3Afoo)')).toBe('[a](/blog/foo)');
    expect(expandInternalLinks('[a](internal_link:/blog/foo)')).toBe('[a](/blog/foo)');
  });

  it('leaves clean bodies alone', () => {
    const md = 'See [pricing](/pricing) and [post](/blog/foo).';
    expect(expandInternalLinks(md)).toBe(md);
    expect(hasInternalLink(expandInternalLinks('[a](internal_link:foo)'))).toBe(false);
  });
});
