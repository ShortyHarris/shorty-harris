import { test, expect, type Page } from '@playwright/test';
import {
  MockSupabase, draft, CAMPAIGN_ARCH, CAMPAIGN_SVJ, statementTimeout, neverAnswer, json,
} from './mockSupabase';

// Replays what Martin (TUTEL) hit in mobile Safari on 13 Nov 2026, 17:18-17:20 Prague time:
// approving SVJ follow-ups while approved_queue / approvals_schedule timed out, a Reject that
// stayed on "Working…" with "Unknown campaign", and a reload stuck on the splash spinner.

// Fresh rows per test: the mock mutates them as drafts are approved or rejected.
const atelier = () => draft(1, { business_name: 'ateliér novák', location: 'Prague 13, Stodůlky', campaign_id: CAMPAIGN_ARCH.id });
const svj = () => [2, 3, 4, 5].map((n) => draft(n, { business_name: `SVJ Terronská ${n}`, campaign_id: CAMPAIGN_SVJ.id }));
const queue = () => [atelier(), ...svj()];

async function openApprovals(page: Page, mock: MockSupabase) {
  await mock.install(page);
  await page.goto('/app/approvals');
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  await expect(page.getByText('ateliér novák').filter({ visible: true }).first()).toBeVisible();
}

function card(page: Page, name: string) {
  // The visible row or card holding this prospect (mobile cards on a phone, table rows on desktop).
  return page.getByTestId('approval-row').filter({ visible: true, hasText: name }).first();
}

test.describe('Reject', () => {
  test('rejects a follow-up and names its campaign', async ({ page }) => {
    const mock = new MockSupabase(queue());
    await openApprovals(page, mock);

    await card(page, 'ateliér novák').getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Reject this draft?' });
    await expect(dialog).toContainText(`1 draft in ${CAMPAIGN_ARCH.name}`);
    await dialog.getByRole('button', { name: 'Reject' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Draft rejected.')).toBeVisible();
    expect(mock.drafts[0].approval_status).toBe('rejected');
  });

  test('a reject the server never answers ends with an error, not "Working…" forever', async ({ page }) => {
    // Real time on purpose: Playwright's fake clock also freezes the modal's exit animation.
    test.slow();
    const mock = new MockSupabase(queue());
    await openApprovals(page, mock);
    mock.override('PATCH /rest/v1/messages', neverAnswer());

    await card(page, 'ateliér novák').getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Reject this draft?' });
    await dialog.getByRole('button', { name: 'Reject' }).click();

    // While it waits the modal still names the real campaign (it used to say "Unknown campaign").
    await expect(dialog.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await expect(dialog).toContainText(CAMPAIGN_ARCH.name);
    await expect(dialog).not.toContainText('Unknown campaign');
    expect(mock.count('PATCH /rest/v1/messages')).toBe(1);

    // The request deadline (25 s) ends the wait.
    await expect(page.getByText(/Couldn't reject: the server didn't answer in time/)).toBeVisible({ timeout: 35_000 });
    await expect(dialog).toBeHidden();
    // Not rejected, so it is back in the list to try again.
    mock.clear('PATCH /rest/v1/messages');
    await expect(page.getByText('ateliér novák').filter({ visible: true }).first()).toBeVisible();
  });

  test('a reject that hits a statement timeout closes the modal with a clear error', async ({ page }) => {
    const mock = new MockSupabase(queue());
    await openApprovals(page, mock);
    mock.override('PATCH /rest/v1/messages', (route) => statementTimeout(route));

    await card(page, 'ateliér novák').getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Reject this draft?' });
    await dialog.getByRole('button', { name: 'Reject' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Couldn't reject: the server is busy/)).toBeVisible();
  });
});

test.describe('Approve', () => {
  test('approving SVJ follow-ups one after another while the list refresh times out', async ({ page }) => {
    const mock = new MockSupabase(queue());
    await openApprovals(page, mock);
    // From here every refresh of the list fails the way production did.
    mock.override('POST /rest/v1/rpc/approved_queue', (route) => statementTimeout(route));
    mock.override('POST /rest/v1/rpc/approvals_schedule', (route) => statementTimeout(route));
    const before = mock.count('POST /rest/v1/rpc/approved_queue');

    const SVJ = mock.drafts.slice(1);
    for (const d of SVJ) {
      await card(page, d.business_name).getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(page.getByText('Email approved.').last()).toBeVisible();
    }

    // Every approve was saved...
    expect(SVJ.every((d) => d.approval_status === 'approved')).toBe(true);
    // ...and the failed refresh says so in words, not "canceling statement due to statement timeout".
    await expect(page.getByText(/server is busy and didn't answer in time.*already approved or rejected are saved/)).toBeVisible();
    await expect(page.getByText('canceling statement')).toHaveCount(0);
    // Four quick approves no longer fire a burst of refetches per tap (it was ~6 per tap).
    const refetches = mock.count('POST /rest/v1/rpc/approved_queue') - before;
    expect(refetches).toBeLessThanOrEqual(SVJ.length * 3);
  });
});

test.describe('Reload after an approvals error', () => {
  test('a reload whose profile request never answers shows Try again, then recovers', async ({ page }) => {
    const mock = new MockSupabase(queue());
    await page.clock.install();
    await openApprovals(page, mock);
    mock.override('POST /rest/v1/rpc/approved_queue', (route) => statementTimeout(route));
    mock.override('GET /rest/v1/profiles', neverAnswer());

    await page.reload();
    await expect(page.getByTestId('boot-splash')).toBeVisible();
    await page.clock.runFor(21_000);
    await page.clock.resume();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/didn't answer in time/);

    mock.clear('GET /rest/v1/profiles');
    mock.clear('POST /rest/v1/rpc/approved_queue');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByText('ateliér novák').filter({ visible: true }).first()).toBeVisible();
  });

  test('a reload whose profile request fails shows the error at once instead of the login page', async ({ page }) => {
    const mock = new MockSupabase(queue());
    await openApprovals(page, mock);
    mock.override('GET /rest/v1/profiles', (route) => json(route, { message: 'Gateway Timeout' }, 504));

    await page.reload();
    await expect(page.getByRole('alert')).toContainText(/didn't answer in time/);
    await expect(page).toHaveURL(/\/app\/approvals$/);

    mock.clear('GET /rest/v1/profiles');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  });

  test('a reload while the approvals list keeps failing still loads the app, with the error shown', async ({ page }) => {
    const mock = new MockSupabase(queue());
    await openApprovals(page, mock);
    mock.override('POST /rest/v1/rpc/approved_queue', (route) => statementTimeout(route));

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByText(/server is busy and didn't answer in time/)).toBeVisible();
    await expect(page.getByTestId('boot-splash')).toHaveCount(0);
  });
});
