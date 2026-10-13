import { useCallback, useEffect, useState } from 'react';

export type AdminTheme = 'light' | 'dark';

const STORAGE_KEY = 'sh-admin-theme';

function initialTheme(): AdminTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked - fall through to the OS preference */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/* Admin light/dark mode. The choice is remembered per browser; first visit
   follows the OS setting. It's applied as <html data-admin-theme> (see
   styles/admin-palette.css) only while the admin layout is mounted, so the
   public site and client app are never affected. */
export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminTheme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.adminTheme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    return () => { delete root.dataset.adminTheme; };
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}
