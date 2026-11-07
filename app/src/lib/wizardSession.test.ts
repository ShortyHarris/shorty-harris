import { describe, expect, it } from 'vitest';
import {
  addService, answersFromProfile, carryDescription, markConfirmed, missingFields, missingMessage, needsCheck,
  normalizeWebsite, seasonLabel, toggleMonth, type WizardAnswers,
} from './wizardSession';

const complete: WizardAnswers = {
  business: { name: 'Mountains Mowing' },
  services: [{ name: 'Lawn mowing' }],
  audience: { business_types: ['Property managers'] },
  area: { areas: [{ mode: 'text', label: 'Bozeman, Montana' }] },
  goal: { goal: 'quotes' },
};

describe('missingFields', () => {
  it('is empty for a complete profile', () => {
    expect(missingFields(complete)).toEqual([]);
  });

  it('names every missing field in the server order', () => {
    expect(missingFields({})).toEqual(['business_name', 'service', 'business_type', 'area', 'goal']);
  });

  it('treats blank entries as missing', () => {
    expect(missingFields({
      ...complete,
      business: { name: '   ' },
      services: [{ name: ' ' }],
      audience: { business_types: [''] },
      area: { areas: [{ mode: 'text', label: '' }] },
      goal: { goal: '' },
    })).toEqual(['business_name', 'service', 'business_type', 'area', 'goal']);
  });

  it('builds a readable message', () => {
    expect(missingMessage(['business_name', 'goal'])).toBe('Fill in company name, your goal to continue.');
    expect(missingMessage([])).toBe('');
  });
});

describe('normalizeWebsite', () => {
  it('adds https and drops a trailing slash', () => {
    expect(normalizeWebsite('mountainsmowing.com')).toBe('https://mountainsmowing.com');
    expect(normalizeWebsite('  https://www.MountainsMowing.com/ ')).toBe('https://www.mountainsmowing.com');
  });

  it('keeps a path', () => {
    expect(normalizeWebsite('example.com/about')).toBe('https://example.com/about');
  });

  it('refuses things that are not a public website', () => {
    for (const bad of ['', 'not a site', 'localhost', 'http://localhost:3000', '127.0.0.1', 'http://10.0.0.1',
      'ftp://example.com', 'javascript:alert(1)', 'http://user:pass@example.com', 'printer.local', 'http://[::1]', 'example.123']) {
      expect(normalizeWebsite(bad), bad).toBeNull();
    }
  });
});

describe('"Please check" tags', () => {
  it('clears a field once confirmed', () => {
    const a: WizardAnswers = { unconfirmed: ['business.industry', 'services'] };
    expect(needsCheck(a, 'services')).toBe(true);
    const b = markConfirmed(a, 'services');
    expect(needsCheck(b, 'services')).toBe(false);
    expect(b.unconfirmed).toEqual(['business.industry']);
    expect(markConfirmed(b, 'nothing')).toBe(b);
  });
});

describe('services', () => {
  it('adds trimmed names and ignores duplicates in any case', () => {
    let list = addService([], ' Lawn mowing ');
    list = addService(list, 'lawn MOWING');
    list = addService(list, '');
    expect(list).toEqual([{ name: 'Lawn mowing', source: 'user', seasonal_months: [] }]);
  });

  it('toggles months in order', () => {
    expect(toggleMonth([12, 1], 11)).toEqual([1, 11, 12]);
    expect(toggleMonth([1, 11, 12], 1)).toEqual([11, 12]);
  });

  it('labels seasons', () => {
    expect(seasonLabel([])).toBe('All year');
    expect(seasonLabel([11, 12, 1, 2, 3])).toBe('Nov–Mar');
    expect(seasonLabel([6, 7, 8])).toBe('Jun–Aug');
    expect(seasonLabel([4])).toBe('Apr');
    expect(seasonLabel([1, 4])).toBe('Jan, Apr');
    expect(seasonLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('All year');
  });
});

describe('answersFromProfile', () => {
  it('rebuilds a complete profile for returning users', () => {
    const a = answersFromProfile({
      businessName: 'Mountains Mowing',
      icp: { target_business_types: ['Property managers'], goal: 'quotes', cta: 'Ask for a quote', exclusions: null },
      services: [{ name: 'Lawn mowing', seasonal_months: null, source: 'website' }],
      areas: [{ mode: 'text', label: 'Bozeman, Montana' }],
    });
    expect(missingFields(a)).toEqual([]);
    expect(a.audience?.exclusions).toEqual([]);
    expect(a.services?.[0]).toEqual({ name: 'Lawn mowing', seasonal_months: [], source: 'website' });
  });

  it('drops an unknown goal', () => {
    const a = answersFromProfile({ businessName: null, icp: { goal: 'world domination' }, services: [], areas: [] });
    expect(a.goal?.goal).toBe('');
  });
});

describe('carryDescription', () => {
  it('copies the screen-1 description when the business has none', () => {
    const a: WizardAnswers = { website: { mode: 'describe', description: ' Lawn care for offices ' }, business: { name: 'MM', description: '' } };
    expect(carryDescription(a).business).toEqual({ name: 'MM', description: 'Lawn care for offices' });
  });
  it('never overwrites what the user wrote, and ignores the website path', () => {
    const own: WizardAnswers = { website: { mode: 'describe', description: 'x' }, business: { description: 'mine' } };
    expect(carryDescription(own)).toBe(own);
    const site: WizardAnswers = { website: { mode: 'website', url: 'a.com', description: 'x' } };
    expect(carryDescription(site)).toBe(site);
  });
});
