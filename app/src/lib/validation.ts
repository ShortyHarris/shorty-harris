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

// A single legitimate "City, State/Country" entry has exactly one comma (two
// comma-separated parts). If a target_locations array ends up with only one
// entry and that entry has more than one comma, it's very likely several
// locations got typed with the wrong separator and collapsed into one string
// (e.g. "Bloomington, IL, Normal, IL" typed where semicolons were expected).
export function looksLikeMultipleLocationsJoined(locations: string[]): boolean {
  if (locations.length !== 1) return false;
  const parts = locations[0].split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 2;
}
