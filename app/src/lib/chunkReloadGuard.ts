// Recovers from stale code-split chunks after a deploy.
//
// Every deploy produces new hashed filenames under /assets (e.g.
// Login-CMRxvUlF.css) and the old ones disappear. A tab that was opened
// before the deploy still runs the old bundle, so the first time it
// navigates to a lazy route (Login after logout, Billing, Settings...) it
// asks for a chunk that no longer exists and Vite throws
// "Unable to preload CSS for ..." / "Failed to fetch dynamically imported
// module". A full reload picks up the new index.html and fixes it, so we do
// that automatically - once, guarded against reload loops.
//
// This file must have NO imports and be imported at the top of main.tsx.
const KEY = 'chunk-reload-at';
const LOOP_WINDOW_MS = 10_000;

function reloadOnce(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0);
  } catch {
    /* storage blocked - fall through and still try one reload */
  }
  // Already reloaded moments ago and it still fails: a real outage, not a
  // stale tab. Let the error surface instead of looping forever.
  if (Date.now() - last < LOOP_WINDOW_MS) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Unable to preload CSS|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|'text\/html' is not a valid JavaScript MIME type/i.test(
    msg,
  );
}

if (typeof window !== 'undefined') {
  // Vite fires this for failed JS/CSS preloads of dynamic imports.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) event.preventDefault();
  });
  // Safety net for failures that bypass Vite's preload helper.
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason) && reloadOnce()) event.preventDefault();
  });
}

export { reloadOnce };
