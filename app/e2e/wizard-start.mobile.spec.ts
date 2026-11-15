import { test, expect, type Route } from '@playwright/test';
import { MockSupabase, json, cors, CLIENT_ID } from './mockSupabase';

// "Find campaigns for me" on 15 Nov 2026: a sandbox client whose three wizard drafts had filled
// their limit of three was walked through every step, and only then told there was no room.
// The wizard now checks for a free slot before the first step.

const obj = (r: Route, o: unknown) => json(r, (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object') ? o : [o]);

function setUp(db: MockSupabase, campaigns: number) {
  const rows = Array.from({ length: campaigns }, (_, i) => ({
    id: `c1000000-0000-4000-8000-00000000000${i}`, client_id: CLIENT_ID, name: `Wizard draft ${i + 1}`, status: 'draft', origin: 'wizard',
    language: 'English', country: 'US', created_at: '2026-11-15T05:26:24Z', prospect_count: 0,
    search_queries: ['law firm'], target_locations: ['Chicago'], target_areas: null, max_results: 200,
  }));
  db.override('GET /rest/v1/campaigns', (r) => json(r, rows));
  db.override('HEAD /rest/v1/campaigns', (r) => r.fulfill({ status: 200, headers: { ...cors(), 'content-range': `*/${campaigns}` } }));
  db.override('GET /rest/v1/clients', (r) => obj(r, { id: CLIENT_ID, business_name: 'Sandbox client', is_sandbox: true, max_campaigns: 3, send_timezone: 'America/Chicago', country: 'US' }));
  db.override('GET /rest/v1/client_usage', (r) => obj(r, { max_campaigns: 3, campaign_count: campaigns, campaigns_remaining: Math.max(3 - campaigns, 0), monthly_prospect_limit: 500, prospects_this_month: 0, prospects_remaining: 500 }));
  db.override('POST /rest/v1/rpc/wizard_on_for', (r) => json(r, true));
  db.override('GET /rest/v1/client_icp', (r) => obj(r, { industry: 'Outbound sales', business_description: 'We find local businesses and email them.', target_business_types: ['law firms'],
    decision_maker_roles: ['Owners'], target_locations: ['Chicago, Illinois, United States'], company_size: null, exclusions: [], goal: 'replies', cta: null, confirmed_at: '2026-11-15T05:40:02Z' }));
  db.override('GET /rest/v1/client_services', (r) => json(r, [{ name: 'Outbound sales', seasonal_months: [], source: 'description' }]));
  db.override('POST /rest/v1/wizard_sessions', (r, b) => json(r, { id: '5e550000-0000-4000-8000-000000000001', client_id: CLIENT_ID, entry_point: b?.entry_point, screen: b?.screen,
    answers: b?.answers, ideas: [], selected: [], status: 'open', updated_at: new Date().toISOString() }));
}

async function findCampaigns(page: import('@playwright/test').Page) {
  await page.goto('/app/campaigns');
  await page.getByRole('button', { name: /New campaign/ }).first().click();
  await page.getByRole('button', { name: /Find campaigns for me/ }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/wizard\?entry=find_new/);
}

test('a client with no free campaign slot is told before the first step', async ({ page }) => {
  const db = new MockSupabase([]);
  setUp(db, 3);
  // The page's own count can be out of date (it was, after the wizard created drafts), so the
  // New campaign button is still on; the wizard itself must catch it.
  db.override('GET /rest/v1/client_usage', (r) => obj(r, { max_campaigns: 3, campaign_count: 2, campaigns_remaining: 1, monthly_prospect_limit: 500, prospects_this_month: 0, prospects_remaining: 500 }));
  await db.install(page);
  await findCampaigns(page);
  await expect(page.getByText("You've used all your campaign slots")).toBeVisible();
  await expect(page.getByText('You have 3 of 3 campaigns.', { exact: false })).toBeVisible();
  expect(db.count('POST /rest/v1/wizard_sessions'), 'no wizard session is started').toBe(0);
  expect(db.count('POST /functions/v1/wizard-ai'), 'and no AI call is made').toBe(0);
  await page.getByRole('button', { name: 'Back to campaigns' }).click();
  await expect(page).toHaveURL(/\/app\/campaigns$/);
});

test('a client with a free slot goes straight into the wizard', async ({ page }) => {
  const db = new MockSupabase([]);
  setUp(db, 2);
  await db.install(page);
  await findCampaigns(page);
  await expect(page.getByText('Step 2 of 3', { exact: false })).toBeVisible();
  expect(db.count('POST /rest/v1/wizard_sessions')).toBe(1);
});
