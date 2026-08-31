const GA_ID = 'G-YEDGN8S0ED';

let loaded = false;

// Only ever called after the visitor has opted into analytics cookies
// (see consent.ts) — previously this loaded unconditionally from index.html.
export function loadGoogleAnalytics() {
  if (loaded) return;
  loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  }
  gtag('js', new Date());
  gtag('config', GA_ID);
}

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
