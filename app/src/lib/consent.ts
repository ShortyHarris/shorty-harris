// Cookie/tracking consent store. GDPR (EU) and Zambia's Data Protection Act
// both require opt-in consent before non-essential cookies are set, which is
// the strictest of the jurisdictions we operate in - so we apply that
// opt-in-by-default standard globally rather than trying to geo-detect the
// visitor (it also satisfies the US/CCPA "opt-out" bar for free, since
// nothing non-essential runs until the visitor has actively agreed).
import { loadGoogleAnalytics } from './googleAnalytics';

export type ConsentCategory = 'analytics';

export interface ConsentState {
  analytics: boolean;
}

const STORAGE_KEY = 'sh_cookie_consent';
const CONSENT_EVENT = 'sh-consent-change';
const OPEN_PREFERENCES_EVENT = 'sh-consent-open-preferences';

interface StoredConsent extends ConsentState {
  respondedAt: string;
}

function readStored(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredConsent;
  } catch {
    return null;
  }
}

export function hasRespondedToConsent(): boolean {
  return readStored() !== null;
}

export function getConsent(): ConsentState {
  const stored = readStored();
  return { analytics: stored?.analytics ?? false };
}

export function setConsent(state: ConsentState) {
  const record: StoredConsent = { ...state, respondedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable (private mode, quota) - consent still applies for this page load
    // via the in-memory event below, it just won't be remembered on the next visit.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
}

export function acceptAllConsent() {
  setConsent({ analytics: true });
}

export function rejectNonEssentialConsent() {
  setConsent({ analytics: false });
}

export function onConsentChange(handler: (state: ConsentState) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<ConsentState>).detail);
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}

// Lets any page (e.g. a "Cookie settings" footer link) reopen the
// preferences banner after the visitor has already responded once.
export function openConsentPreferences() {
  window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}

export function onOpenConsentPreferences(handler: () => void) {
  window.addEventListener(OPEN_PREFERENCES_EVENT, handler);
  return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, handler);
}

// Applies whatever the visitor has (or hasn't) consented to, on every load -
// so a returning visitor who already opted in gets analytics without seeing
// the banner again, and one who opted out (or hasn't answered) doesn't.
export function applyStoredConsent() {
  if (getConsent().analytics) loadGoogleAnalytics();
}
