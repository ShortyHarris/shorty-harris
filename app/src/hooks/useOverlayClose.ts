import { useRef, useCallback, type MouseEvent } from 'react';

/**
 * Closes a modal/panel only when both mousedown and mouseup land on the
 * overlay itself. Without this, dragging a text selection from inside the
 * panel out past the overlay edge fires a click on the overlay (mouseup
 * target) and closes the modal mid-selection.
 */
export function useOverlayClose(onClose: () => void) {
  const downOnOverlay = useRef(false);

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
