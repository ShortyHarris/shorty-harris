import { describe, expect, it } from 'vitest';
import { confirmPage, firstPageOf, nextPage, pageHasGuesses, pageReady, prevPage, stepProgress, STEP_OF, PAGES } from './wizardPages';
import type { WizardAnswers } from './wizardSession';

describe('wizard pages', () => {
  it('walks one question at a time through three steps', () => {
    expect(PAGES.map((p) => STEP_OF[p])).toEqual([1, 2, 2, 2, 2, 2, 3]);
    expect(nextPage('website')).toBe('about');
    expect(nextPage('goal')).toBe('ideas');
    expect(nextPage('ideas')).toBeNull();
    expect(prevPage('website')).toBeNull();
    expect(prevPage('about')).toBe('website');
    expect(firstPageOf(2)).toBe('about');
    expect(firstPageOf(3)).toBe('ideas');
  });

  it('fills the progress bar segment by segment', () => {
    expect(stepProgress('website')).toEqual([1, 0, 0]);
    expect(stepProgress('about')).toEqual([1, 0.2, 0]);
    expect(stepProgress('goal')).toEqual([1, 1, 0]);
    expect(stepProgress('ideas')).toEqual([1, 1, 1]);
  });

  it('only lets Next through when the page has what it needs', () => {
    const a: WizardAnswers = {};
    expect(pageReady('website', a)).toBe(true);
    expect(pageReady('about', a)).toBe(false);
    expect(pageReady('about', { business: { name: 'MM' } })).toBe(true);
    expect(pageReady('services', { services: [{ name: 'Lawn mowing' }] })).toBe(true);
    expect(pageReady('customers', { audience: { business_types: ['Offices'] } })).toBe(true);
    expect(pageReady('area', { area: { areas: [{ mode: 'text', label: 'Bozeman' }] } })).toBe(true);
    expect(pageReady('goal', { goal: { goal: 'quotes' } })).toBe(true);
    expect(pageReady('goal', { goal: { goal: '' } })).toBe(false);
  });

  it('shows and clears "please check" a page at a time', () => {
    const a: WizardAnswers = { unconfirmed: ['business.name', 'services', 'area'] };
    expect(pageHasGuesses('about', a)).toBe(true);
    expect(pageHasGuesses('goal', a)).toBe(false);
    const b = confirmPage('about', a);
    expect(b.unconfirmed).toEqual(['services', 'area']);
    expect(confirmPage('goal', b)).toBe(b);
  });
});
