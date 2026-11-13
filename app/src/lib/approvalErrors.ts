// Raw database errors ("canceling statement due to statement timeout") told Martin nothing on
// 13 Nov 2026 and read as if his approvals had failed. They hadn't: every approve was saved,
// only the reload of the list behind it timed out. These say what happened and what to do.

const BUSY = /statement timeout|57014|PGRST003|connection pool|Gateway Time-?out|\b504\b|didn't answer within/i;
const OFFLINE = /Failed to fetch|Load failed|NetworkError|network connection was lost|Internet connection appears to be offline/i;

export function isServerBusyError(message: string | null | undefined): boolean {
  return !!message && BUSY.test(message);
}

/** Banner text when the approvals list or counts fail to load. */
export function describeApprovalsLoadError(message: string): string {
  if (isServerBusyError(message)) {
    return "Couldn't refresh your approvals: the server is busy and didn't answer in time. "
      + 'Drafts you already approved or rejected are saved. Tap Refresh in a moment.';
  }
  if (OFFLINE.test(message)) {
    return "Couldn't refresh your approvals: no connection to the server. Check your internet and tap Refresh.";
  }
  return `Couldn't load your approvals: ${message}`;
}

/**
 * Short reason for a failed approve/reject, for toasts. A timeout doesn't prove the write didn't
 * land, so it doesn't claim either way: the list refreshes and shows the truth.
 */
export function describeWriteError(message: string): string {
  if (/didn't answer within|AbortError|aborted/i.test(message)) {
    return "the server didn't answer in time. The list is refreshing: if the draft is still there, try again";
  }
  if (isServerBusyError(message)) return 'the server is busy right now. Try again in a moment';
  if (OFFLINE.test(message)) return 'no connection to the server. Check your internet and try again';
  return message || 'the request failed';
}
