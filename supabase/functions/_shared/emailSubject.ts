// Subject-line handling for outgoing email (gmail-client edge function).
//
// Why this exists: Czech subjects such as "Realizace vašich interiérů v Praze" reached
// Gmail as "Realizace vaÃ…Â¡ich interiÃƒÂ©rÃ…Â¯ v Praze". The stored subject was clean;
// the Subject header was written as raw, re-encoded bytes instead of an RFC 2047 encoded
// word, and every follow-up reused that broken header for the thread.
//
// Rules this module enforces:
//   1. A Subject header is plain ASCII, or RFC 2047 "=?UTF-8?B?...?=" encoded words.
//      Never raw UTF-8, never a string that has already been byte-mangled.
//   2. Encode exactly once, at the moment the MIME message is built. Callers pass the
//      clean Unicode subject exactly as stored in messages.subject.
//   3. A follow-up's subject comes from the clean stored subject of the thread's first
//      email, never from a header read back out of Gmail.
//
// No imports: runs unchanged in Deno (edge functions) and in Node (vitest).

/** Max UTF-8 bytes per encoded word: 45 bytes -> 60 base64 chars + 12 overhead = 72 <= 75 (RFC 2047 limit). */
const MAX_BYTES_PER_WORD = 45;

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Strip characters that must never appear in a header value (CR/LF would allow header injection). */
export function cleanSubject(subject: string): string {
  return String(subject ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .normalize('NFC');
}

/**
 * Encode a subject for the "Subject:" header. Pure ASCII passes through unchanged;
 * anything else becomes one or more RFC 2047 B-encoded words, split on character
 * boundaries (never inside a multi-byte character) and folded with CRLF + space.
 * Returns only the value, without "Subject: ".
 */
export function encodeSubjectHeader(subject: string): string {
  const s = cleanSubject(subject);
  if (/^[\x20-\x7E]*$/.test(s)) return s;

  const words: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  for (const ch of s) {
    const n = new TextEncoder().encode(ch).length;
    if (chunkBytes + n > MAX_BYTES_PER_WORD && chunk) {
      words.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += n;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${utf8Base64(w)}?=`).join('\r\n ');
}

// Windows-1252 bytes 0x80-0x9F -> Unicode. Undefined slots map to the C1 control of the
// same value, matching how browsers and Gmail fall back.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const CP1252_REVERSE = new Map<number, number>();
for (let b = 0; b < 256; b++) {
  const cp = b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b;
  CP1252_REVERSE.set(cp, b);
}

/** Lead bytes of UTF-8 multi-byte sequences, as they look after a cp1252/latin-1 misread. */
const MOJIBAKE_HINT = /[ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïð][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]/;

function undoOneLevel(s: string): string | null {
  const bytes: number[] = [];
  for (const ch of s) {
    const b = CP1252_REVERSE.get(ch.codePointAt(0)!);
    if (b === undefined) return null; // contains a real non-latin character: not mojibake
    bytes.push(b);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * Undo UTF-8-read-as-Windows-1252 corruption, repeated up to `maxLevels` times.
 * "vaÃ…Â¡ich" -> "vašich". Text that is already correct is returned unchanged,
 * because a genuine "š" or "ř" is not a cp1252 character and stops the repair.
 */
export function repairMojibake(input: string, maxLevels = 3): string {
  let s = String(input ?? '');
  for (let i = 0; i < maxLevels && MOJIBAKE_HINT.test(s); i++) {
    const fixed = undoOneLevel(s);
    if (fixed === null || fixed === s) break;
    s = fixed;
  }
  return s;
}

/** True when the text still looks byte-mangled after repair (do not send it). */
export function looksLikeMojibake(s: string): boolean {
  return MOJIBAKE_HINT.test(String(s ?? ''));
}

/** "Re: <original>", without stacking "Re: Re:". */
export function replySubject(original: string): string {
  const base = cleanSubject(original).replace(/^((re|aw|odp|fwd?)\s*:\s*)+/i, '');
  return base ? `Re: ${base}` : '';
}

/**
 * The subject to use for an email that continues an existing thread.
 *
 * Order of trust:
 *   1. threadOriginalSubject: messages.subject of the thread's first (initial) email,
 *      as stored in the database. This is the clean source of truth.
 *   2. templateSubject: the campaign template subject, if the initial row is missing.
 *   3. gmailThreadSubject: the Subject header read back from Gmail. Only used after
 *      mojibake repair, and only if the repair leaves no corruption behind.
 *   4. ownSubject: the follow-up's own stored subject, as a last resort (it starts a new
 *      Gmail conversation if it differs, but it is at least readable).
 */
export function threadFollowUpSubject(opts: {
  threadOriginalSubject?: string | null;
  templateSubject?: string | null;
  gmailThreadSubject?: string | null;
  ownSubject?: string | null;
}): string {
  const candidates = [opts.threadOriginalSubject, opts.templateSubject, opts.gmailThreadSubject];
  for (const c of candidates) {
    if (!c) continue;
    const repaired = repairMojibake(cleanSubject(c));
    if (repaired && !looksLikeMojibake(repaired)) return replySubject(repaired);
  }
  return cleanSubject(repairMojibake(opts.ownSubject ?? ''));
}
