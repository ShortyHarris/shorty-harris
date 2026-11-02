import { describe, it, expect } from 'vitest';
import { realSummary, listExcerpt } from './hotLeadText';

const lead = (ai_summary: string | null) => ({ business_name: 'SVJ Bellusova', ai_summary });

describe('hot lead text', () => {
  it('keeps a real summary', () => {
    const l = lead('Asked for pricing and a site visit next week.');
    expect(realSummary(l)).toBe('Asked for pricing and a site visit next week.');
    expect(listExcerpt(l)).toBe('Asked for pricing and a site visit next week.');
  });

  it('treats "<business> replied: <email>" as the pasted reply, not a summary', () => {
    const l = lead('SVJ Bellusova replied: Dobrý den, prosíme o cenovou nabídku.');
    expect(realSummary(l)).toBeNull();
    expect(listExcerpt(l)).toBe('Dobrý den, prosíme o cenovou nabídku.');
  });

  it('treats an overlong summary as not a summary but still lists it', () => {
    const l = lead('x'.repeat(401));
    expect(realSummary(l)).toBeNull();
    expect(listExcerpt(l)).toBe('x'.repeat(401));
  });

  it('handles a missing summary', () => {
    expect(realSummary(lead(null))).toBeNull();
    expect(listExcerpt(lead(null))).toBeNull();
  });
});
