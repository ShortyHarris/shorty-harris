import { useRef, useCallback, useEffect, type MouseEvent } from 'react';
import { useIsPresent } from 'framer-motion';

// Overlays that opted into Escape, oldest first. Escape closes only the
// topmost one still open, so a confirm dialog stacked on a modal doesn't take
// the modal down with it.
interface OpenOverlay { close: { current: () => void }; present: { current: boolean } }
const openOverlays: OpenOverlay[] = [];

function onEscape(e: KeyboardEvent) {
  // Something inside already handled it (an open Radix select, a row menu).
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  // An overlay mid exit-animation is still mounted; skip it so a stale close
  // (e.g. a dirty-check from before the save) never fires.
  const top = [...openOverlays].reverse().find((o) => o.present.current);
  if (!top) return;
  e.preventDefault();
  top.close.current();
}

/**
 * Closes a modal/panel only when both mousedown and mouseup land on the
 * overlay itself. Without this, dragging a text selection from inside the
 * panel out past the overlay edge fires a click on the overlay (mouseup
 * target) and closes the modal mid-selection.
 *
 * `escape: true` also closes it on Escape while it's the topmost overlay.
 * Opt-in, because an editor without an unsaved-changes guard would lose its
 * content to a single keypress.
 */
export function useOverlayClose(onClose: () => void, { escape = false }: { escape?: boolean } = {}) {
  const downOnOverlay = useRef(false);
  const closeRef = useRef(onClose);
  const isPresent = useIsPresent();
  const presentRef = useRef(isPresent);

  useEffect(() => {
    closeRef.current = onClose;
    presentRef.current = isPresent;
  });

  useEffect(() => {
    if (!escape) return;
    const entry: OpenOverlay = { close: closeRef, present: presentRef };
    openOverlays.push(entry);
    if (openOverlays.length === 1) document.addEventListener('keydown', onEscape);
    return () => {
      const i = openOverlays.lastIndexOf(entry);
      if (i !== -1) openOverlays.splice(i, 1);
      if (openOverlays.length === 0) document.removeEventListener('keydown', onEscape);
    };
  }, [escape]);

  const onMouseDown = useCallback((e: MouseEvent<HTMLElement>) => {
    downOnOverlay.current = e.target === e.currentTarget;
  }, []);

  const onMouseUp = useCallback((e: MouseEvent<HTMLElement>) => {
    if (downOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    downOnOverlay.current = false;
  }, [onClose]);

  return { onMouseDown, onMouseUp };
}
