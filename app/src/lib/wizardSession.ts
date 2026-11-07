// Campaign Wizard answers: the shape saved in wizard_sessions.answers, and the rules the screens
// apply to it. confirm_wizard_profile() (migration campaign_wizard_foundation) checks the same
// required fields on the server; keep the two lists in step.

import type { TargetArea } from './targetAreas';

export type WizardScreen = 1 | 2 | 3;
export type WizardEntry = 'onboarding' | 'new_campaign' | 'find_new';
export type WizardGoal = 'quotes' | 'meetings' | 'calls' | 'replies';
/** Where a value came from: typed by the user, read from the website, or guessed from a description. */
export type FieldSource = 'user' | 'website' | 'description';

export interface WizardService {
  name: string;
  seasonal_months?: number[];
  source?: FieldSource;
}

export interface WizardAnswers {
  website?: { mode: 'website' | 'describe'; url?: string; description?: string; area_text?: string; best_customers?: string };
  business?: { name?: string; industry?: string; description?: string };
  services?: WizardService[];
  audience?: { business_types?: string[]; roles?: string[]; company_size?: string; exclusions?: string[] };
  area?: { areas?: TargetArea[] };
  goal?: { goal?: WizardGoal | ''; cta?: string };
  /** Fields the AI filled in and the user has not touched yet, e.g. "business.industry". */
  unconfirmed?: string[];
  /** ideasFingerprint() of the answers the current campaign ideas were made from. */
  ideas_fp?: string;
}

export const GOALS: { value: WizardGoal; label: string; hint: string }[] = [
  { value: 'quotes', label: 'Get quote requests', hint: 'Businesses ask you for a price' },
  { value: 'meetings', label: 'Book meetings', hint: 'A call or visit to talk it through' },
  { value: 'calls', label: 'Get phone calls', hint: 'They ring you' },
  { value: 'replies', label: 'Start conversations', hint: 'Any interested reply' },
];

export const COMPANY_SIZES = ['Any size', '1–10 staff', '11–50 staff', '51–200 staff', '200+ staff'];

export type MissingField = 'business_name' | 'service' | 'business_type' | 'area' | 'goal';

export const MISSING_LABELS: Record<MissingField, string> = {
  business_name: 'Company name',
  service: 'At least one service',
  business_type: 'At least one type of business to reach',
  area: 'Where you work',
  goal: 'Your goal',
};

const filled = (s: string | undefined | null) => typeof s === 'string' && s.trim() !== '';

/** Required before campaign ideas can be generated (AC-41). Same order as the server's list. */
export function missingFields(a: WizardAnswers): MissingField[] {
  const out: MissingField[] = [];
  if (!filled(a.business?.name)) out.push('business_name');
  if (!(a.services ?? []).some((s) => filled(s.name))) out.push('service');
  if (!(a.audience?.business_types ?? []).some(filled)) out.push('business_type');
  if (!(a.area?.areas ?? []).some((x) => filled(x.label))) out.push('area');
  if (!a.goal?.goal) out.push('goal');
  return out;
}

/** "Add the missing fields first: Company name, Your goal." */
export function missingMessage(missing: MissingField[]): string {
  if (missing.length === 0) return '';
  return `Fill in ${missing.map((m) => MISSING_LABELS[m].toLowerCase()).join(', ')} to continue.`;
}

/**
 * Turns what someone types into a fetchable website address, or null if it can't be one.
 * "mountainsmowing.com" -> "https://mountainsmowing.com". Only public http(s) host names:
 * no IP addresses, no localhost, no other schemes (the server checks again before fetching).
 */
export function normalizeWebsite(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (/^[\d.]+$/.test(host) || host.startsWith('[')) return null;
  if (!/^[a-z0-9.-]+$/.test(host) || !/[a-z]/.test(host.split('.').pop() ?? '')) return null;
  url.hostname = host;
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

/** Removes a field from the "please check" list once the user has edited or confirmed it. */
export function markConfirmed(a: WizardAnswers, field: string): WizardAnswers {
  if (!a.unconfirmed?.includes(field)) return a;
  return { ...a, unconfirmed: a.unconfirmed.filter((f) => f !== field) };
}

export function needsCheck(a: WizardAnswers, field: string): boolean {
  return a.unconfirmed?.includes(field) ?? false;
}

/** Service list edits: trims, drops blanks, and ignores a name that is already there (any case). */
export function addService(list: WizardService[], name: string, source: FieldSource = 'user'): WizardService[] {
  const n = name.trim();
  if (!n || list.some((s) => s.name.trim().toLowerCase() === n.toLowerCase())) return list;
  return [...list, { name: n, source, seasonal_months: [] }];
}

export function toggleMonth(months: number[] | undefined, m: number): number[] {
  const set = new Set(months ?? []);
  if (set.has(m)) set.delete(m); else set.add(m);
  return [...set].sort((a, b) => a - b);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LABELS = MONTHS;

/** "Nov–Mar" for a season that wraps the year, "Jun–Aug", or "Jan, Apr" for scattered months. */
export function seasonLabel(months: number[] | undefined): string {
  const ms = [...new Set(months ?? [])].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (ms.length === 0 || ms.length === 12) return 'All year';
  // Find the run start: a month whose previous month (wrapping) is not in the set.
  const set = new Set(ms);
  const starts = ms.filter((m) => !set.has(m === 1 ? 12 : m - 1));
  if (starts.length === 1) {
    const start = starts[0];
    const end = ((start - 2 + ms.length) % 12) + 1;
    return ms.length === 1 ? MONTHS[start - 1] : `${MONTHS[start - 1]}–${MONTHS[end - 1]}`;
  }
  return ms.map((m) => MONTHS[m - 1]).join(', ');
}

/** Builds wizard answers from a saved profile, for returning users and "Find new campaigns". */
export function answersFromProfile(p: {
  businessName: string | null;
  icp: {
    industry?: string | null; business_description?: string | null; target_business_types?: string[] | null;
    decision_maker_roles?: string[] | null; company_size?: string | null; exclusions?: string[] | null;
    goal?: string | null; cta?: string | null;
  } | null;
  services: { name: string; seasonal_months: number[] | null; source: string }[];
  areas: TargetArea[];
}): WizardAnswers {
  const goal = p.icp?.goal;
  return {
    business: { name: p.businessName ?? '', industry: p.icp?.industry ?? '', description: p.icp?.business_description ?? '' },
    services: p.services.map((s) => ({ name: s.name, seasonal_months: s.seasonal_months ?? [], source: (s.source as FieldSource) ?? 'user' })),
    audience: {
      business_types: p.icp?.target_business_types ?? [],
      roles: p.icp?.decision_maker_roles ?? [],
      company_size: p.icp?.company_size ?? '',
      exclusions: p.icp?.exclusions ?? [],
    },
    area: { areas: p.areas },
    goal: { goal: goal === 'quotes' || goal === 'meetings' || goal === 'calls' || goal === 'replies' ? goal : '', cta: p.icp?.cta ?? '' },
    unconfirmed: [],
  };
}

/** True when the saved profile already has everything screen 2 requires. */
export function profileComplete(a: WizardAnswers): boolean {
  return missingFields(a).length === 0;
}

/** Copies the "What do you do?" answer from screen 1 into the business description if that is empty. */
export function carryDescription(a: WizardAnswers): WizardAnswers {
  const typed = a.website?.mode === 'describe' ? a.website.description?.trim() : '';
  if (!typed || a.business?.description?.trim()) return a;
  return { ...a, business: { ...a.business, description: typed } };
}

// ── AI profile (wizard-ai "analyze") ────────────────────────────────────────────────────────
export interface AiProfile {
  business: { name: string; industry: string; description: string };
  services: { name: string; seasonal_months: number[] }[];
  audience: { business_types: string[]; roles: string[]; company_size: string };
  area_text: string;
  goal: string;
  language: string;
}

const isGoal = (g: string): g is WizardGoal => g === 'quotes' || g === 'meetings' || g === 'calls' || g === 'replies';

/**
 * Fills the answers from the AI's reading of the website or description. Never overwrites
 * anything the user typed or confirmed: empty fields are filled, lists gain new entries, and
 * every field the AI filled is marked "Please check".
 */
export function mergeAnalysis(a: WizardAnswers, p: AiProfile, source: FieldSource): WizardAnswers {
  const unconfirmed = new Set(a.unconfirmed ?? []);
  const fill = (cur: string | undefined, next: string, field: string): string => {
    if (cur?.trim() || !next.trim()) return cur ?? '';
    unconfirmed.add(field);
    return next;
  };
  const union = (cur: string[] | undefined, next: string[], field: string): string[] => {
    const have = new Set((cur ?? []).map((x) => x.toLowerCase()));
    const added = next.filter((x) => x.trim() && !have.has(x.toLowerCase()));
    if (added.length) unconfirmed.add(field);
    return [...(cur ?? []), ...added];
  };

  let services = a.services ?? [];
  const before = services.length;
  for (const s of p.services) {
    services = addService(services, s.name, source);
    const added = services[services.length - 1];
    if (services.length > before && added.name.toLowerCase() === s.name.toLowerCase() && s.seasonal_months.length) {
      services = services.map((x) => (x === added ? { ...x, seasonal_months: s.seasonal_months } : x));
    }
  }
  if (services.length > before) unconfirmed.add('services');

  const business = {
    ...a.business,
    name: fill(a.business?.name, p.business.name, 'business.name'),
    industry: fill(a.business?.industry, p.business.industry, 'business.industry'),
    description: fill(a.business?.description, p.business.description, 'business.description'),
  };
  const audience = {
    ...a.audience,
    business_types: union(a.audience?.business_types, p.audience.business_types, 'audience.business_types'),
    roles: union(a.audience?.roles, p.audience.roles, 'audience.roles'),
    company_size: a.audience?.company_size || p.audience.company_size || '',
  };
  let goal = a.goal;
  if (!a.goal?.goal && isGoal(p.goal)) { goal = { ...a.goal, goal: p.goal }; unconfirmed.add('goal'); }
  const website = a.website && !a.website.area_text && p.area_text ? { ...a.website, area_text: p.area_text } : a.website;
  // The area the website or description names becomes the first area, to check or replace.
  let area = a.area;
  if (!(a.area?.areas ?? []).length && p.area_text.trim()) {
    area = { areas: [{ mode: 'text', label: p.area_text.trim() }] };
    unconfirmed.add('area');
  }

  return { ...a, website: website ?? (p.area_text ? { mode: 'website', area_text: p.area_text } : a.website), business, services, audience, goal, area, unconfirmed: [...unconfirmed] };
}

/** A short fingerprint of what campaign ideas depend on, to notice when screen 2 changed since. */
export function ideasFingerprint(a: WizardAnswers): string {
  return JSON.stringify([
    a.business?.name?.trim().toLowerCase(),
    (a.services ?? []).map((s) => [s.name.trim().toLowerCase(), s.seasonal_months ?? []]),
    (a.audience?.business_types ?? []).map((x) => x.toLowerCase()),
    (a.audience?.exclusions ?? []).map((x) => x.toLowerCase()),
    (a.area?.areas ?? []).map((x) => x.label.toLowerCase()),
    a.goal?.goal,
  ]);
}
