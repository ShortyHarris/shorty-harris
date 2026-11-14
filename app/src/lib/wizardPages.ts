// Campaign Wizard pages: one question per page, grouped into the three steps the client sees
// in the progress bar (Airbnb host-onboarding style). The saved session keeps the step
// (wizard_sessions.screen 1-3); the page inside step 2 is just where the user is now.

import { missingFields, type WizardAnswers, type WizardScreen } from './wizardSession';

export type WizardPage = 'website' | 'about' | 'services' | 'customers' | 'area' | 'goal' | 'ideas';

export const PAGES: WizardPage[] = ['website', 'about', 'services', 'customers', 'area', 'goal', 'ideas'];

export const STEP_OF: Record<WizardPage, WizardScreen> = {
  website: 1, about: 2, services: 2, customers: 2, area: 2, goal: 2, ideas: 3,
};

export const STEP_NAMES: Record<WizardScreen, string> = { 1: 'Your business', 2: 'Check the details', 3: 'Pick campaigns' };

/** The first page of a step (used when resuming a saved session). */
export function firstPageOf(step: WizardScreen): WizardPage {
  return PAGES.find((p) => STEP_OF[p] === step) ?? 'website';
}

export function nextPage(p: WizardPage): WizardPage | null {
  const i = PAGES.indexOf(p);
  return i >= 0 && i < PAGES.length - 1 ? PAGES[i + 1] : null;
}

export function prevPage(p: WizardPage): WizardPage | null {
  const i = PAGES.indexOf(p);
  return i > 0 ? PAGES[i - 1] : null;
}

/** How full each of the three progress segments is (0-1), for the bar at the bottom. */
export function stepProgress(p: WizardPage): [number, number, number] {
  const step = STEP_OF[p];
  const inStep = PAGES.filter((x) => STEP_OF[x] === step);
  const done = (inStep.indexOf(p) + 1) / inStep.length;
  return [1, 2, 3].map((s) => (s < step ? 1 : s === step ? done : 0)) as [number, number, number];
}

/** The fields each page is responsible for, so "Please check" can be shown and cleared per page. */
export const PAGE_FIELDS: Record<WizardPage, string[]> = {
  website: [],
  about: ['business.name', 'business.industry', 'business.description'],
  services: ['services'],
  customers: ['audience.business_types', 'audience.roles', 'audience.company_size', 'audience.exclusions'],
  area: ['area'],
  goal: ['goal'],
  ideas: [],
};

/** True when this page has something the AI filled in and the user hasn't confirmed yet. */
export function pageHasGuesses(p: WizardPage, a: WizardAnswers): boolean {
  return PAGE_FIELDS[p].some((f) => a.unconfirmed?.includes(f));
}

/** Pressing Next confirms what is on the page. */
export function confirmPage(p: WizardPage, a: WizardAnswers): WizardAnswers {
  const fields = PAGE_FIELDS[p];
  if (!fields.length || !a.unconfirmed?.some((f) => fields.includes(f))) return a;
  return { ...a, unconfirmed: a.unconfirmed.filter((f) => !fields.includes(f)) };
}

/** Whether Next is allowed on this page (the same required fields the server checks). */
export function pageReady(p: WizardPage, a: WizardAnswers): boolean {
  const missing = new Set(missingFields(a));
  switch (p) {
    case 'about': return !missing.has('business_name');
    case 'services': return !missing.has('service');
    case 'customers': return !missing.has('business_type');
    case 'area': return !missing.has('area');
    case 'goal': return !missing.has('goal');
    default: return true;
  }
}
