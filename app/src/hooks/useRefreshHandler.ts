import { useCallback } from 'react';
import type { ToastKind } from '../components/Toast';

export function useRefreshHandler(
  reload: () => Promise<void> | void,
  toast: (message: string, kind?: ToastKind) => void,
  errorMessage = 'Failed to refresh.',
) {
  return useCallback(async () => {
    try {
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : errorMessage, 'error');
    }
  }, [reload, toast, errorMessage]);
}
