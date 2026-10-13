import { describe, it, expect, beforeEach, vi } from 'vitest';

const isArguments = (v: unknown) => Object.prototype.toString.call(v) === '[object Arguments]';

// `loaded` is module state, so each test gets a fresh copy of the module.
async function freshModule() {
  vi.resetModules();
  return import('./googleAnalytics');
}

describe('googleAnalytics', () => {
  beforeEach(() => {
    window.dataLayer = undefined as unknown as unknown[];
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
  });

  it('pushes Arguments objects (not plain Arrays) for js and config', async () => {
    const { loadGoogleAnalytics } = await freshModule();
    loadGoogleAnalytics();

    const entries = window.dataLayer as ArrayLike<unknown>[];
    const js = entries.find((e) => e[0] === 'js');
    const config = entries.find((e) => e[0] === 'config');

    expect(js).toBeDefined();
    expect(config).toBeDefined();
    for (const entry of [js, config]) {
      expect(isArguments(entry)).toBe(true);
      expect(Array.isArray(entry)).toBe(false);
    }
    expect(config![1]).toBe('G-YEDGN8S0ED');
    expect(config![2]).toEqual({ send_page_view: false });
    expect(document.head.querySelector('script[src="https://www.googletagmanager.com/gtag/js?id=G-YEDGN8S0ED"]')).not.toBeNull();
  });

  it('trackPageView is a no-op before the tag is loaded', async () => {
    const { trackPageView } = await freshModule();
    trackPageView('/pricing');
    expect(window.dataLayer).toBeUndefined();
  });

  it('trackPageView sends a page_view event after loading', async () => {
    const { loadGoogleAnalytics, trackPageView } = await freshModule();
    loadGoogleAnalytics();
    document.title = 'Pricing';
    trackPageView('/pricing?x=1');

    const entries = window.dataLayer as ArrayLike<unknown>[];
    const event = entries.find((e) => e[0] === 'event');
    expect(isArguments(event)).toBe(true);
    expect(event![1]).toBe('page_view');
    expect(event![2]).toEqual({
      page_path: '/pricing?x=1',
      page_location: window.location.href,
      page_title: 'Pricing',
    });
  });
});
