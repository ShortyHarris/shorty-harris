import { useCallback, useEffect, useState } from 'react';

export type AppTheme = 'light' | 'dark';
/** @deprecated use AppTheme */
export type AdminTheme = AppTheme;
export type ThemeScope = 'admin' | 'client';

// One preference shared by the admin and client apps, so switching in one
// carries over to the other in the same browser.
const STORAGE_KEY = 'sh-theme';
const LEGACY_KEY = 'sh-admin-theme';

function initialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked - fall through to the OS preference */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/* Light/dark mode for the signed-in apps (admin + client). The choice is
   remembered per browser; first visit follows the OS setting. It's applied as
   <html data-theme data-theme-scope> (see styles/admin-palette.css) only while
   a layout using this hook is mounted, so public pages are never affected.
   The scope matters for light mode only: the admin uses neutral greys, the
   client keeps its purple-tinted brand palette. Dark mode is shared. */
export function useAppTheme(scope: ThemeScope) {
  const [theme, setTheme] = useState<AppTheme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themeScope = scope;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    return () => {
      delete root.dataset.theme;
      delete root.dataset.themeScope;
    };
  }, [theme, scope]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}

export function useAdminTheme() {
  return useAppTheme('admin');
}
