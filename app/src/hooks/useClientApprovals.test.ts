import { describe, it, expect } from 'vitest';
import { parseApprovedQueue, awaitingInCampaign, QUEUE_SORT_OPTIONS, DEFAULT_QUEUE_SORT } from './useClientApprovals';

// The held-draft filtering and the "approved/blocked/sendable" arithmetic now live in the
// approved_queue RPC. The client must show those numbers exactly as returned: the bug this
// replaced subtracted held rows a second time on the client and read 0 for 61 sendable drafts.

const body = (over: Record<string, unknown> = {}) => ({
  ok: true, is_admin: false, time_zone: 'Europe/Prague', total: 0, rows: [],
  counts: { approved: 0, sendable: 0, scheduled: 0, blocked: 0, policy_held: 0, pending: 0, pending_policy_held: 0, awaiting_prospects: 0 },
  stats: { pending: 0, approved_today: 0, sent_today: 0, rejected_today: 0, rejected_total: 0 },
  ...over,
});

describe('parseApprovedQueue: TUTEL shape (160 approved, 99 held by send rules, 0 other blocked)', () => {
  it('a client sees 61 sendable, never 0', () => {
    // What the RPC returns to a client: the 99 held rows are not in any count.
    const q = parseApprovedQueue(body({
      total: 61,
      counts: { approved: 61, sendable: 61, scheduled: 0, blocked: 0, policy_held: 0 },
    }));
    expect(q.counts).toMatchObject({ approved: 61, sendable: 61, scheduled: 0, blocked: 0, policyHeld: 0 });
    expect(q.counts.sendable).toBe(61);
    expect(q.counts.sendable).not.toBe(0);
    expect(q.total).toBe(61);
    expect(q.isAdmin).toBe(false);
  });

  it('an admin sees all 160 with 99 held, and nothing is subtracted on the client', () => {
    const q = parseApprovedQueue(body({
      is_admin: true, total: 160,
      counts: { approved: 160, sendable: 61, scheduled: 0, blocked: 99, policy_held: 99 },
    }));
    expect(q.counts).toMatchObject({ approved: 160, sendable: 61, scheduled: 0, blocked: 99, policyHeld: 99 });
    expect(q.counts.sendable).toBe(61);
    expect(q.isAdmin).toBe(true);
  });

  it('passes counts through untouched even when they look inconsistent (no client-side arithmetic)', () => {
    const q = parseApprovedQueue(body({ counts: { approved: 5, sendable: 99, scheduled: 0, blocked: 0, policy_held: 99 } }));
    expect(q.counts.sendable).toBe(99);
    expect(q.counts.policyHeld).toBe(99);
  });
});

describe('parseApprovedQueue: pending tab (TUTEL: 764 pending, nothing held)', () => {
  const counts = (over: Record<string, number> = {}) => ({
    approved: 61, sendable: 61, scheduled: 0, blocked: 0, policy_held: 0,
    pending: 764, pending_policy_held: 0, awaiting_prospects: 300, ...over,
  });

  it('passes the server pending counts straight through', () => {
    const q = parseApprovedQueue(body({ total: 764, counts: counts(), stats: { pending: 764 } }));
    expect(q.counts.pending).toBe(764);
    expect(q.counts.pendingPolicyHeld).toBe(0);
    expect(q.counts.awaitingProspects).toBe(300);
    expect(q.stats.pending).toBe(764);
  });

  it('an admin sees held pending drafts counted and flagged on the rows', () => {
    const q = parseApprovedQueue(body({
      is_admin: true, total: 2, counts: counts({ pending: 2, pending_policy_held: 1 }),
      rows: [
        { id: 'a', prospect_id: 'p1', approval_status: 'pending', block_reason: null, approved_at: null, policy_held: true, prospect: null },
        { id: 'b', prospect_id: 'p2', approval_status: 'pending', block_reason: null, approved_at: null, policy_held: false, prospect: null },
      ],
    }));
    expect(q.counts.pending).toBe(2);
    expect(q.counts.pendingPolicyHeld).toBe(1);
    expect(q.items.map((i) => i.policy_held)).toEqual([true, false]);
    expect(q.items.every((i) => i.approval_status === 'pending' && i.block_reason === null)).toBe(true);
  });

  it('does no subtraction: a client count is exactly what the server returned', () => {
    // The server already left held drafts out; nothing here may adjust it.
    expect(parseApprovedQueue(body({ counts: counts({ pending: 10, pending_policy_held: 99 }) })).counts.pending).toBe(10);
  });

  it('defaults the pending counts to zero when an older response lacks them', () => {
    const q = parseApprovedQueue({ ok: true, counts: { approved: 5 } });
    expect(q.counts).toMatchObject({ pending: 0, pendingPolicyHeld: 0, awaitingProspects: 0 });
  });
});

describe('awaiting prospects by campaign', () => {
  // TUTEL as a client: six campaigns that sum to the account-wide figure.
  const byCampaign = { 'c-1': 300, 'c-2': 200, 'c-3': 120, 'c-4': 80, 'c-5': 40, 'c-6': 24 };
  const withMap = (map: unknown, over: Record<string, unknown> = {}) => parseApprovedQueue(body({
    counts: {
      approved: 61, sendable: 61, scheduled: 0, blocked: 0, policy_held: 0,
      pending: 764, pending_policy_held: 0, awaiting_prospects: 764, awaiting_prospects_by_campaign: map, ...over,
    },
  }));

  it('passes the server map through and it adds up to the account figure', () => {
    const q = withMap(byCampaign);
    expect(q.counts.awaitingProspectsByCampaign).toEqual(byCampaign);
    const sum = Object.values(q.counts.awaitingProspectsByCampaign).reduce((a, b) => a + b, 0);
    expect(sum).toBe(764);
    expect(sum).toBe(q.counts.awaitingProspects);
  });

  it('reads a campaign missing from the map as 0, not undefined', () => {
    const q = withMap(byCampaign);
    expect(awaitingInCampaign(q.counts, 'c-3')).toBe(120);
    expect(awaitingInCampaign(q.counts, 'no-pending-here')).toBe(0);
    expect(awaitingInCampaign({ awaitingProspectsByCampaign: {} }, 'c-1')).toBe(0);
  });

  it('is an empty map when the server sends none or something that is not a map', () => {
    for (const bad of [undefined, null, [], 'x', 5]) {
      expect(withMap(bad).counts.awaitingProspectsByCampaign).toEqual({});
    }
  });

  it('ignores entries whose value is not a number', () => {
    expect(withMap({ 'c-1': 3, 'c-2': '4', 'c-3': null }).counts.awaitingProspectsByCampaign).toEqual({ 'c-1': 3 });
  });

  it('does no arithmetic: an admin and a client each get exactly the server map', () => {
    expect(withMap({ 'c-1': 10 }, { pending_policy_held: 2 }).counts.awaitingProspectsByCampaign).toEqual({ 'c-1': 10 });
  });
});

describe('parseApprovedQueue: shape', () => {
  it('maps stats to camelCase, including rejected today versus all time', () => {
    const q = parseApprovedQueue(body({
      stats: { pending: 668, approved_today: 0, sent_today: 10, rejected_today: 3, rejected_total: 447 },
    }));
    expect(q.stats).toEqual({ pending: 668, approvedToday: 0, sentToday: 10, rejectedToday: 3, rejectedTotal: 447 });
  });

  it('flattens the prospect and keeps the block reason and campaign status', () => {
    const q = parseApprovedQueue(body({
      total: 1,
      rows: [{
        id: 'm1', prospect_id: 'p1', campaign_id: 'c1', channel: 'email', subject: 's', body: 'b',
        message_type: 'initial', approval_status: 'approved', created_at: '2026-10-30T00:00:00Z',
        block_reason: 'campaign_inactive', campaign_status: 'draft', policy_held: false,
        prospect: { id: 'p1', business_name: 'Acme', contact_name: null, email: 'a@b.cz', phone: null, category: null, location: null },
      }],
    }));
    expect(q.items).toHaveLength(1);
    expect(q.items[0].block_reason).toBe('campaign_inactive');
    expect(q.items[0].campaign_status).toBe('draft');
    expect(q.items[0].prospect?.business_name).toBe('Acme');
  });

  it('defaults a sparse body to zeros and a non-admin view', () => {
    const q = parseApprovedQueue({ ok: true });
    expect(q.items).toEqual([]);
    expect(q.total).toBe(0);
    expect(q.counts).toEqual({
      approved: 0, sendable: 0, scheduled: 0, blocked: 0, policyHeld: 0, pending: 0, pendingPolicyHeld: 0, awaitingProspects: 0,
      awaitingProspectsByCampaign: {},
    });
    expect(q.isAdmin).toBe(false);
  });

  it('rejects a refusal instead of returning an empty view', () => {
    expect(() => parseApprovedQueue({ ok: false, error: 'not_permitted' })).toThrow('not_permitted');
  });
});

describe('Approved and Blocked sort options', () => {
  it('offers only what the server can sort by, never the Pending-only scheduled or pending-since sorts', () => {
    const values = QUEUE_SORT_OPTIONS.map((o) => o.value).sort();
    expect(values).toEqual(['approved_asc', 'approved_desc', 'prospect_asc', 'prospect_desc']);
    expect(values.some((v) => v.startsWith('scheduled') || v.startsWith('pending'))).toBe(false);
  });

  it('defaults to newest approval first', () => {
    expect(DEFAULT_QUEUE_SORT).toBe('approved_desc');
    expect(QUEUE_SORT_OPTIONS.some((o) => o.value === DEFAULT_QUEUE_SORT)).toBe(true);
  });
});
