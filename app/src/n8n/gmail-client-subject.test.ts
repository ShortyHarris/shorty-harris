import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// gmail-client edge function: the Subject header and the subject of threaded follow-ups.
// These tests run the exact functions from supabase/functions/gmail-client/index.ts (the
// deployed source), lifted out of the file, so they cannot drift from what runs live.
const src = readFileSync(resolve(__dirname, '../../../supabase/functions/gmail-client/index.ts'), 'utf8');

function lift(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in gmail-client`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`could not parse ${name}`);
}
// Strip the few TypeScript annotations these functions use.
const js = lift('encodeHeader')
  .replace(/\(value: string\): string/, '(value)')
  .replace(/const words: string\[\]/, 'const words');
const encodeHeader = new Function(`${js}; return encodeHeader;`)() as (v: string) => string;

// The follow-up subject rule, as written in resolveThreading.
const threadLine = src.match(/const subj = (.+);\n/)![1];
const followUpSubject = new Function('initial', `return ${threadLine};`) as (i: { subject: string }) => string;

// RFC 2047 decoder, the way Gmail reads the header.
function decodeHeader(v: string): string {
  const parts = v.replace(/\r\n /g, '').split(/(=\?UTF-8\?B\?[^?]+\?=)/);
  let out = '';
  let bytes: number[] = [];
  for (const p of parts) {
    const m = p.match(/^=\?UTF-8\?B\?([^?]+)\?=$/);
    if (m) { bytes.push(...Array.from(atob(m[1]), (c) => c.charCodeAt(0))); continue; }
    if (p === '') continue;
    if (bytes.length) { out += new TextDecoder().decode(new Uint8Array(bytes)); bytes = []; }
    out += p;
  }
  if (bytes.length) out += new TextDecoder().decode(new Uint8Array(bytes));
  return out;
}

const CZECH = [
  'Realizace vašich interiérů v Praze',
  'Rekonstrukce bytů pro vaše klienty v Praze',
  'Rekonstrukce domu Společenství vlastníků Terronská 871, Praha 6',
  'Spolehlivý dodavatel oprav pro vaše domy v Praze',
  'Příliš žluťoučký kůň úpěl ďábelské ódy: š é ů ý á ř č',
];

describe('gmail-client Subject header', () => {
  it('leaves plain ASCII alone', () => {
    expect(encodeHeader('Following up - Monument Advocacy')).toBe('Following up - Monument Advocacy');
  });

  it.each(CZECH)('sends %s as RFC 2047 ASCII that Gmail decodes back exactly', (s) => {
    const h = encodeHeader(s);
    expect(h).toMatch(/^=\?UTF-8\?B\?/);
    expect(h).toMatch(/^[\x20-\x7E\r\n]*$/);
    expect(h).not.toMatch(/Ã|Å/);
    expect(decodeHeader(h)).toBe(s);
  });

  it('keeps each encoded word within 75 characters without splitting a character', () => {
    const long = 'Řešení pro žluťoučké koně: ' + 'čšřžýáíéůú'.repeat(8);
    const h = encodeHeader(long);
    for (const w of h.split('\r\n ')) expect(w.length).toBeLessThanOrEqual(75);
    expect(decodeHeader(h)).toBe(long);
  });

  it('cannot inject headers through CR/LF', () => {
    expect(encodeHeader('Ahoj\r\nBcc: x@example.com')).toBe('Ahoj Bcc: x@example.com');
  });
});

describe('gmail-client follow-up subject', () => {
  it('is "Re: " + the stored first-email subject, encoded once', () => {
    const initial = { subject: 'Realizace vašich interiérů v Praze' };
    const subjects = [initial.subject, followUpSubject(initial), followUpSubject(initial)];
    expect(subjects.map((s) => decodeHeader(encodeHeader(s)))).toEqual([
      'Realizace vašich interiérů v Praze',
      'Re: Realizace vašich interiérů v Praze',
      'Re: Realizace vašich interiérů v Praze',
    ]);
  });

  it('does not stack Re:', () => {
    expect(followUpSubject({ subject: 'Re: Spolehlivý dodavatel' })).toBe('Re: Spolehlivý dodavatel');
  });
});
