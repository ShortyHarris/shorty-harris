import { test, expect, type Route } from '@playwright/test';
import { MockSupabase, json, CLIENT_ID } from './mockSupabase';

// On 28 Nov 2026 a client's two launched campaigns had waited six days in the scrape queue
// while the dispatcher failed, and their Campaigns page said only "Active · Never scraped".
// The page now shows each campaign's search the way the admin page does: queued (with its place
// in line), searching, couldn't find prospects, or done with what it found.

const obj = (r: Route, o: unknown) => json(r, (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object') ? o : [o]);
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const MEDICAL = 'c2000000-0000-4000-8000-000000000001';
const OFFICES = 'c2000000-0000-4000-8000-000000000002';
const SNOW = 'c2000000-0000-4000-8000-000000000003';
const CAFES = 'c2000000-0000-4000-8000-000000000004';

const base = {
  client_id: CLIENT_ID, language: 'English', country: 'US', channel: 'email', max_results: 200, target_areas: null,
  target_locations: ['Bozeman, MT'], upfront_sequence: false, description: null, scrape_failure_reason: null,
  last_scrape_summary: null, scrape_started_at: null, last_scraped_at: null, scrape_status: 'idle',
};

const campaigns = [
  { ...base, id: MEDICAL, name: 'Medical and Dental', status: 'active', created_at: '2026-11-13T00:05:21Z', prospect_count: 0,
    search_queries: ['Dental Office', 'Chiropractor', 'Veterinary Clinic', 'Physical Therapy', 'Private Medical Practice'] },
  { ...base, id: OFFICES, name: 'Professional Offices', status: 'active', created_at: '2026-11-13T00:03:38Z', prospect_count: 0,
    search_queries: ['Accounting Firm', 'Law Firm', 'Insurance Agency', 'Engineering Firm', 'Financial Advisor'],
    scrape_status: 'running', scrape_started_at: ago(6) },
  { ...base, id: SNOW, name: 'Snow Removal Property Management', status: 'active', created_at: '2026-09-19T16:01:15Z', prospect_count: 77,
    search_queries: ['Property Management', 'Property Manager', 'HOA', 'Residential Property Management'],
    scrape_status: 'complete', last_scraped_at: '2026-09-19T18:42:39Z',
    last_scrape_summary: { total_scraped: 158, total_with_email: 81, skipped_dnc: 0, skipped_duplicate: 1, new_prospects: 77 } },
  { ...base, id: CAFES, name: 'Cafes and Restaurants', status: 'active', created_at: '2026-09-01T00:00:00Z', prospect_count: 0,
    search_queries: ['Cafe', 'Restaurant'], scrape_status: 'failed', scrape_failure_reason: 'apify_poll_timeout' },
];

function setUp(db: MockSupabase) {
  db.override('GET /rest/v1/campaigns', (r) => json(r, campaigns));
  db.override('GET /rest/v1/clients', (r) => obj(r, { id: CLIENT_ID, business_name: 'Mountains Mowing and Snow Removal', is_sandbox: false, send_timezone: 'America/Denver', country: 'US' }));
  db.override('GET /rest/v1/client_usage', (r) => obj(r, { max_campaigns: 5, campaign_count: 4, campaigns_remaining: 1, monthly_prospect_limit: 500, prospects_this_month: 77, prospects_remaining: 423 }));
  db.override('POST /rest/v1/rpc/client_campaign_queue_state', (r) => json(r, [
    { campaign_id: MEDICAL, status: 'queued', requested_at: ago(3), started_at: null, ahead: 0 },
    { campaign_id: OFFICES, status: 'running', requested_at: ago(20), started_at: ago(6), ahead: null },
  ]));
  db.override('POST /rest/v1/rpc/approved_queue', (r) => json(r, {
    ok: true, is_admin: false, time_zone: 'America/Denver', total: 0, rows: [],
    counts: { approved: 0, sendable: 0, pending: 13, pending_followups: 0, awaiting_prospects: 13, awaiting_prospects_by_campaign: { [SNOW]: 13 } },
    stats: { pending: 13, approved_today: 0, sent_today: 0 },
  }));
}

async function shot(page: import('@playwright/test').Page, name: string) {
  const dir = process.env.SHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test('each campaign says where its prospect search is', async ({ page }, info) => {
  const db = new MockSupabase([]);
  setUp(db);
  await db.install(page);
  await page.goto('/app/campaigns');

  // Desktop shows the table, phones the cards; check whichever this project renders.
  const view = page.locator(info.project.name.includes('mobile') ? '.md\\:hidden' : '.atbl');
  const row = (name: string) => view.locator(':is(tr, div.rounded-xl)', { hasText: name }).first();

  await expect(row('Medical and Dental')).toContainText('Queued');
  await expect(row('Medical and Dental')).toContainText('next in line');
  await expect(row('Medical and Dental')).toContainText('Launching');
  await expect(row('Professional Offices')).toContainText('Finding prospects');
  await expect(row('Snow Removal Property Management')).toContainText('+77 new');
  await expect(row('Snow Removal Property Management')).toContainText('13 prospects waiting for your approval');
  await expect(row('Cafes and Restaurants')).toContainText("Couldn't find prospects");
  // Searching or queued keeps the page checking on its own.
  await expect(page.getByText('Updating automatically')).toBeVisible();
  await shot(page, `campaigns-${info.project.name}`);

  // The +77 chip opens what the last search found, with no admin actions.
  await row('Snow Removal Property Management').getByRole('button', { name: /\+77 new/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Last search' });
  await expect(dialog).toContainText('77 new prospects added');
  await expect(dialog).toContainText('Businesses found');
  await expect(dialog).toContainText('Property Management');
  await expect(dialog.getByRole('link', { name: 'Review 13 prospects' })).toBeVisible();
  await expect(dialog.getByText(/Queue|Retry/)).toHaveCount(0);
  await shot(page, `breakdown-${info.project.name}`);
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  // A failed search says what happened in plain words, never the technical error.
  await row('Cafes and Restaurants').getByRole('button', { name: /Couldn't find prospects/ }).click();
  const failed = page.getByRole('dialog', { name: "Couldn't find prospects" });
  await expect(failed).toContainText('ran for 30 minutes');
  await expect(failed.getByText(/Queue a retry|Technical detail/)).toHaveCount(0);
});

test('nothing in flight: the page stops refreshing itself', async ({ page }) => {
  const db = new MockSupabase([]);
  setUp(db);
  db.override('GET /rest/v1/campaigns', (r) => json(r, campaigns.filter((c) => c.id === SNOW)));
  db.override('POST /rest/v1/rpc/client_campaign_queue_state', (r) => json(r, []));
  await db.install(page);
  await page.goto('/app/campaigns');
  await expect(page.getByText('+77 new').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Updating automatically')).toHaveCount(0);
});
