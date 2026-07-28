// Shared form-input validation/normalization for contact data (phone, email).
// Phones are normalized before they ever reach the DB so downstream consumers
// (Twilio/WhatsApp sends, DNC matching, etc.) always get a clean value instead
// of whatever mix of spaces/dashes/parens an admin happened to type.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

// Strips everything except digits (and a leading +) — "+260 970 001 0001",
// "(260) 970-001-0001", and "260 970 001 0001" all normalize to the same
// stored value.
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

// E.164 allows up to 15 digits; 7 is a permissive floor that still catches
// obviously-truncated input without rejecting valid shorter local numbers.
export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw).replace('+', '');
  return digits.length >= 7 && digits.length <= 15;
}

const STATE_CODE_RE = /\b[A-Z]{2}\b/g;

// A single legitimate "City, State/Country" entry has exactly one comma (two
// comma-separated parts) and exactly one state-code-shaped token. If a
// target_locations array ends up with only one entry, flag it when either:
//   - it has more than one comma (e.g. "Bloomington, IL, Normal, IL" typed
//     where semicolons were expected), or
//   - it contains 2+ state-code-shaped tokens like "Bloomington IL, Normal IL"
//     — only one comma, so the comma-count check alone misses it, but two
//     cities were still joined without a separator before each one.
export function looksLikeMultipleLocationsJoined(locations: string[]): boolean {
  if (locations.length !== 1) return false;
  const entry = locations[0];

  const parts = entry.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length > 2) return true;

  const stateCodeMatches = entry.match(STATE_CODE_RE) ?? [];
  return stateCodeMatches.length >= 2;
}
