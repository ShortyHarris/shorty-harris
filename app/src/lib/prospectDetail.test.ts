import { describe, it, expect } from 'vitest';
import { extraFields, safeWebsiteHref } from './prospectDetail';

describe('extraFields', () => {
  it('skips shown, id and empty fields', () => {
    expect(extraFields({
      id: '1', client_id: 'c', business_name: 'A', email: 'a@b.c', website: 'x.com',
      is_sandbox: false, notes: '', tags: [], meta: {}, source: null,
    })).toEqual([{ label: 'Is sandbox', value: 'No' }]);
  });
  it('flattens a jsonb object one level and humanizes labels', () => {
    expect(extraFields({ enrichment: { owner_name: 'Jan', rating: 4.5, empty: '' } })).toEqual([
      { label: 'Enrichment: Owner name', value: 'Jan' },
      { label: 'Enrichment: Rating', value: '4.5' },
    ]);
  });
  it('stringifies arrays', () => {
    expect(extraFields({ tags: ['a', 'b'] })).toEqual([{ label: 'Tags', value: '["a","b"]' }]);
  });
});

describe('safeWebsiteHref', () => {
  it('adds https to bare domains', () => {
    expect(safeWebsiteHref('example.cz')).toBe('https://example.cz/');
  });
  it('keeps http(s) urls', () => {
    expect(safeWebsiteHref('http://example.cz/a')).toBe('http://example.cz/a');
  });
  it('rejects other schemes and blanks', () => {
    expect(safeWebsiteHref('javascript:alert(1)')).toBeNull();
    expect(safeWebsiteHref('  ')).toBeNull();
    expect(safeWebsiteHref(null)).toBeNull();
  });
});
