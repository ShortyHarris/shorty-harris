export interface TourStep {
  id: string;
  path: string;
  selector: string;
  title: string;
  body: string;
  // Shown instead of `body` when the target element never appears (e.g. a
  // brand-new account with no warm prospects yet) — without this, a new
  // user just sees a dark screen with a description of something invisible
  // and no explanation why.
  fallbackBody?: string;
}

// Each step's `selector` matches a `data-tour="..."` attribute placed on the
// real element it should highlight (see Dashboard.tsx, Campaigns.tsx,
// Billing.tsx, Settings.tsx). `path` is the route the step lives on — the
// tour navigates there automatically when advancing to a step on a
// different page.
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'stats',
    path: '/app',
    selector: 'dashboard-stats',
    title: 'Your key numbers',
    body: 'A quick look at new, in-progress, won, and lost leads.',
  },
  {
    id: 'warm-prospects',
    path: '/app',
    selector: 'warm-prospects',
    title: 'Worth a call',
    body: "Prospects who've opened your emails multiple times without replying — a phone call here often closes the deal.",
    fallbackBody: "You don't have any of these yet — this section fills up once some of your emails get opened more than once without a reply. Nothing to see here for now, moving on.",
  },
  {
    id: 'lead-filters',
    path: '/app',
    selector: 'lead-filters',
    title: 'Filter your leads',
    body: 'Move between new, active, and closed leads as conversations progress.',
  },
  {
    id: 'new-campaign',
    path: '/app/campaigns',
    selector: 'new-campaign-btn',
    title: 'Start a campaign',
    body: 'Create your own outreach campaign — pick a location, search terms, and language, and we take it from there.',
  },
  {
    id: 'credits',
    path: '/app/billing',
    selector: 'credit-balance',
    title: 'Credits',
    body: 'Each hot lead routed to you costs one credit. Buy more anytime from this page.',
  },
  {
    id: 'business-profile',
    path: '/app/settings',
    selector: 'business-profile',
    title: 'Your business profile',
    body: 'Keep your business info current, and set who signs your outreach emails.',
  },
  {
    id: 'gmail-connect',
    path: '/app/settings',
    selector: 'gmail-connect',
    title: 'Connect Gmail',
    body: 'Connect your own Gmail so outreach goes out from your real address and replies land in your inbox.',
  },
];
