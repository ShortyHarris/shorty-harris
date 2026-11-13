import { describe, it, expect } from 'vitest';
import {
  encodeSubjectHeader,
  repairMojibake,
  looksLikeMojibake,
  replySubject,
  threadFollowUpSubject,
  cleanSubject,
} from '../../../supabase/functions/_shared/emailSubject';

// Simulates the bug: UTF-8 bytes read back as Windows-1252, `levels` times.
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
function mangle(s: string, levels = 1): string {
  for (let i = 0; i < levels; i++) {
    s = Array.from(new TextEncoder().encode(s), (b) =>
      String.fromCodePoint(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b),
    ).join('');
  }
  return s;
}

// Minimal RFC 2047 decoder, the way Gmail reads the header.
function decodeHeader(v: string): string {
  return v
    .replace(/\r\n /g, '')
    .replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64) =>
      `\u0000${b64}\u0000`,
    )
    .split('\u0000')
    .reduce<{ out: string; bytes: number[] }>((acc, part, i) => {
      if (i % 2 === 1) acc.bytes.push(...Array.from(atob(part), (c) => c.charCodeAt(0)));
      else {
        if (acc.bytes.length) acc.out += new TextDecoder().decode(new Uint8Array(acc.bytes));
        acc.bytes = [];
        acc.out += part;
      }
      return acc;
    }, { out: '', bytes: [] }).out;
}

const CZECH = [
  'Realizace vašich interiérů v Praze',
  'Rekonstrukce bytů pro vaše klienty',
  'Rekonstrukce domu Terronská 871',
  'Spolehlivý dodavatel',
  'Příliš žluťoučký kůň úpěl ďábelské ódy',
  'Čeština: š é ů ý á ř č Ř Č Š Ž',
];

describe('encodeSubjectHeader', () => {
  it('leaves plain ASCII alone', () => {
    expect(encodeSubjectHeader('Following up - Monument Advocacy')).toBe('Following up - Monument Advocacy');
  });

  it.each(CZECH)('encodes %s as RFC 2047 that decodes back exactly', (subject) => {
    const header = encodeSubjectHeader(subject);
    expect(header).toMatch(/^=\?UTF-8\?B\?/);
    expect(header).toMatch(/^[\x20-\x7E\r\n]*$/); // only ASCII on the wire
    expect(decodeHeader(header)).toBe(subject);
  });

  it('keeps every encoded word within 75 characters and never splits a character', () => {
    const long = 'Řešení pro žluťoučké koně: ' + 'čšřžýáíéůú'.repeat(8);
    const header = encodeSubjectHeader(long);
    for (const word of header.split('\r\n ')) expect(word.length).toBeLessThanOrEqual(75);
    expect(decodeHeader(header)).toBe(long);
  });

  it('strips CR/LF so a subject cannot inject headers', () => {
    expect(encodeSubjectHeader('Ahoj\r\nBcc: x@example.com')).toBe('Ahoj Bcc: x@example.com');
  });

  it('is not applied twice by accident: encoding the encoded value is a no-op', () => {
    const once = encodeSubjectHeader('Spolehlivý dodavatel');
    expect(encodeSubjectHeader(once)).toBe(once.replace(/\r\n /g, ' '));
  });
});

describe('repairMojibake', () => {
  it('fixes the exact strings Martin saw', () => {
    expect(repairMojibake('Realizace vaÃ…Â¡ich interiÃƒÂ©rÃ…Â¯ v Praze')).toBe('Realizace vašich interiérů v Praze');
    expect(repairMojibake('Rekonstrukce bytÃ…Â¯ pro vaÃ…Â¡e klienty')).toBe('Rekonstrukce bytů pro vaše klienty');
    expect(repairMojibake('Rekonstrukce domu TerronskÃƒÂ¡ 871')).toBe('Rekonstrukce domu Terronská 871');
    expect(repairMojibake('SpolehlivÃƒÂ½ dodavatel')).toBe('Spolehlivý dodavatel');
  });

  it.each(CZECH)('undoes one, two and three levels of corruption of %s', (s) => {
    for (const levels of [1, 2, 3]) expect(repairMojibake(mangle(s, levels))).toBe(s);
  });

  it.each([...CZECH, 'Café à Paris', 'Quick question about Žižkov', 'Ã la carte? No: plain text'])(
    'leaves correct text unchanged: %s',
    (s) => {
      expect(repairMojibake(s)).toBe(s);
    },
  );

  it('flags corrupted text', () => {
    expect(looksLikeMojibake('vaÃ…Â¡ich')).toBe(true);
    expect(looksLikeMojibake('vašich')).toBe(false);
  });
});

describe('follow-up subjects', () => {
  it('prefixes Re: once', () => {
    expect(replySubject('Spolehlivý dodavatel')).toBe('Re: Spolehlivý dodavatel');
    expect(replySubject('Re: RE: Spolehlivý dodavatel')).toBe('Re: Spolehlivý dodavatel');
  });

  it('uses the clean stored initial subject, not the broken Gmail header', () => {
    expect(
      threadFollowUpSubject({
        threadOriginalSubject: 'Realizace vašich interiérů v Praze',
        gmailThreadSubject: 'Realizace vaÃ…Â¡ich interiÃƒÂ©rÃ…Â¯ v Praze',
        ownSubject: 'Navazujeme na náš e-mail - Studio X',
      }),
    ).toBe('Re: Realizace vašich interiérů v Praze');
  });

  it('existing broken threads: falls back to the template, then a repaired Gmail header', () => {
    expect(
      threadFollowUpSubject({ templateSubject: 'Spolehlivý dodavatel', gmailThreadSubject: 'SpolehlivÃƒÂ½ dodavatel' }),
    ).toBe('Re: Spolehlivý dodavatel');
    expect(threadFollowUpSubject({ gmailThreadSubject: 'Re: SpolehlivÃƒÂ½ dodavatel' })).toBe('Re: Spolehlivý dodavatel');
  });

  it('repairs a stored subject that was itself saved corrupted', () => {
    expect(threadFollowUpSubject({ threadOriginalSubject: 'Rekonstrukce domu TerronskÃƒÂ¡ 871' })).toBe(
      'Re: Rekonstrukce domu Terronská 871',
    );
  });

  it('the full send of 1 initial + 2 follow-ups puts clean, encoded subjects on the wire', () => {
    const initial = 'Realizace vašich interiérů v Praze';
    const sends = [initial, threadFollowUpSubject({ threadOriginalSubject: initial }), threadFollowUpSubject({ threadOriginalSubject: initial })];
    expect(sends.map((s) => decodeHeader(encodeSubjectHeader(s)))).toEqual([
      initial,
      `Re: ${initial}`,
      `Re: ${initial}`,
    ]);
  });

  it('cleanSubject normalises to NFC', () => {
    expect(cleanSubject('Spolehlivý')).toBe('Spolehlivý');
  });
});
