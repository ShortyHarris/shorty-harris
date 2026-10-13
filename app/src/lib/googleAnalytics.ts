const GA_ID = 'G-YEDGN8S0ED';

let loaded = false;

// gtag.js only processes dataLayer entries that are an Arguments object - a
// plain Array (e.g. from rest parameters) is silently ignored, so this must
// push `arguments`, exactly like Google's snippet. `_args` only types the call.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

// Only ever called after the visitor has opted into analytics cookies
// (see consent.ts) - previously this loaded unconditionally from index.html.
export function loadGoogleAnalytics() {
  if (loaded) return;
  loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  gtag('js', new Date());
  // Page views are sent manually on every route change (see
  // GoogleAnalyticsPageViews in App.tsx), including the first one, so the
  // automatic one here would double count.
  gtag('config', GA_ID, { send_page_view: false });
}

// No-op until loadGoogleAnalytics() has run, so callers can't send anything
// before consent.
export function trackPageView(pagePath: string) {
  if (!loaded) return;
  gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });
}

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
