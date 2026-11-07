import { describe, it, expect } from 'vitest';
import { loadNodeCode, runNode } from './runNode';

// WF2.5 > Compute Per-Client Send Batch: decides, once a minute, which approved emails go now.
const code = loadNodeCode('wf2.5-compute-per-client-send-batch.js');

type Client = {
  id: string; send_timezone?: string; daily_cap?: number | null; warmup_mode?: string;
  is_sandbox?: boolean; clock_offset_minutes?: number; sandbox_fast?: boolean;
};
const client = (over: Partial<Client> = {}): Client => ({
  id: 'c1', send_timezone: 'America/Chicago', daily_cap: 40, warmup_mode: 'warm', is_sandbox: false, ...over,
});
const approved = (n: number, cid = 'c1', type = 'initial') =>
  Array.from({ length: n }, (_, i) => ({
    id: `${cid}-${type}-${i}`, client_id: cid, message_type: type,
    created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
  }));
const sentAt = (iso: string, cid = 'c1') => ({ client_id: cid, sent_at: iso });

function batch(opts: { now: string; clients: Client[]; approved: unknown[]; sent?: unknown[]; random?: number }) {
  const out = runNode(code, {
    'Get All Approved Unsent': opts.approved as Record<string, unknown>[],
    'Get Sent Today': (opts.sent ?? []) as Record<string, unknown>[],
    'Get Client Timezones': opts.clients as unknown as Record<string, unknown>[],
  }, { now: opts.now, random: opts.random });
  return out.filter((i) => i.json._empty === false).map((i) => i.json.id as string);
}

// Wed 4 Nov 2026. Chicago is UTC-6, so 15:00 UTC = 09:00 Chicago.
const WED_10AM_CHICAGO = '2026-11-04T16:00:00Z';

describe('sending hours (Mon-Fri, 9am-5pm in the client time zone)', () => {
  it('sends inside sending hours', () => {
    expect(batch({ now: WED_10AM_CHICAGO, clients: [client()], approved: approved(2) })).toHaveLength(2);
  });

  it('sends nothing before 9am, at or after 5pm, or at the weekend', () => {
    for (const now of ['2026-11-04T14:59:00Z', '2026-11-04T23:00:00Z', '2026-11-07T16:00:00Z']) {
      expect(batch({ now, clients: [client()], approved: approved(2) })).toEqual([]);
    }
  });

  it('uses each client\'s own time zone', () => {
    // 16:00 UTC is 10am in Chicago but 5pm in Prague (closed).
    const out = batch({
      now: WED_10AM_CHICAGO,
      clients: [client(), client({ id: 'c2', send_timezone: 'Europe/Prague' })],
      approved: [...approved(1, 'c1'), ...approved(1, 'c2')],
    });
    expect(out).toEqual(['c1-initial-0']);
  });

  it('falls back to Chicago for an unknown time zone instead of failing', () => {
    expect(batch({ now: WED_10AM_CHICAGO, clients: [client({ send_timezone: 'Not/AZone' })], approved: approved(1) })).toHaveLength(1);
  });
});

// Public holidays (OA-4) are not this node's job: since 2026-11-07 the send gate it reads
// (sendable_messages) holds every email on a weekend or a public holiday in the email's send
// country, so on a holiday this node receives nothing to send. Tested in the database tests
// (supabase/tests/database/10_overdue_approvals.test.sql, OA-4).

describe('daily limit', () => {
  it('stops at the daily limit, counting only today in the client time zone', () => {
    const today = Array.from({ length: 39 }, () => sentAt('2026-11-04T15:30:00Z'));
    const yesterday = Array.from({ length: 10 }, () => sentAt('2026-11-03T20:00:00Z'));
    expect(batch({ now: WED_10AM_CHICAGO, clients: [client()], approved: approved(5), sent: [...today, ...yesterday] })).toHaveLength(1);
  });

  it('sends nothing when the limit is used up or the mailbox is paused (limit 0)', () => {
    const today = Array.from({ length: 40 }, () => sentAt('2026-11-04T15:30:00Z'));
    expect(batch({ now: WED_10AM_CHICAGO, clients: [client()], approved: approved(3), sent: today })).toEqual([]);
    expect(batch({ now: WED_10AM_CHICAGO, clients: [client({ daily_cap: 0 })], approved: approved(3) })).toEqual([]);
  });

  it('sends at most 10 per client per run', () => {
    expect(batch({ now: WED_10AM_CHICAGO, clients: [client()], approved: approved(25) })).toHaveLength(10);
  });
});

describe('warm-up spacing (new mailbox, limit under 40)', () => {
  const warming = client({ warmup_mode: 'ramp', daily_cap: 5 });

  it('sends one at a time, never a burst', () => {
    expect(batch({ now: WED_10AM_CHICAGO, clients: [warming], approved: approved(5) })).toHaveLength(1);
  });

  it('waits about 58 minutes after the last send at 5 a day (43 to 72 minutes)', () => {
    const last = (minsAgo: number) => [sentAt(new Date(Date.parse(WED_10AM_CHICAGO) - minsAgo * 60000).toISOString())];
    // Middle of the random range: gap = 480/5 x 0.6 = 57.6 minutes.
    expect(batch({ now: WED_10AM_CHICAGO, clients: [warming], approved: approved(3), sent: last(50), random: 0.5 })).toEqual([]);
    expect(batch({ now: WED_10AM_CHICAGO, clients: [warming], approved: approved(3), sent: last(60), random: 0.5 })).toHaveLength(1);
    // Ends of the range: 43.2 and 72 minutes.
    expect(batch({ now: WED_10AM_CHICAGO, clients: [warming], approved: approved(3), sent: last(44), random: 0 })).toHaveLength(1);
    expect(batch({ now: WED_10AM_CHICAGO, clients: [warming], approved: approved(3), sent: last(71), random: 1 })).toEqual([]);
  });

  it('a long gap still releases only one email (no catching up after a delay)', () => {
    const lastYesterday = [sentAt('2026-11-03T16:00:00Z')];
    expect(batch({ now: WED_10AM_CHICAGO, clients: [warming], approved: approved(5), sent: lastYesterday })).toHaveLength(1);
  });
});

describe('send order', () => {
  it('sends due follow-ups before first emails, oldest first', () => {
    const out = batch({
      now: WED_10AM_CHICAGO, clients: [client()],
      approved: [...approved(2, 'c1', 'initial'), ...approved(1, 'c1', 'follow_up_d3')],
    });
    expect(out[0]).toBe('c1-follow_up_d3-0');
    expect(out.slice(1)).toEqual(['c1-initial-0', 'c1-initial-1']);
  });
});

describe('sandbox accounts', () => {
  it('fast mode sends at any hour', () => {
    const fast = client({ is_sandbox: true, sandbox_fast: true, daily_cap: 100 });
    expect(batch({ now: '2026-11-07T04:00:00Z', clients: [fast], approved: approved(2) })).toHaveLength(2);
  });

  it('real rules follow the sandbox clock: 8pm real time moved forward 13 hours is 9am next day', () => {
    const sbx = (offset: number) => client({ is_sandbox: true, clock_offset_minutes: offset });
    const WED_8PM_CHICAGO = '2026-11-05T02:00:00Z';
    expect(batch({ now: WED_8PM_CHICAGO, clients: [sbx(0)], approved: approved(1) })).toEqual([]);
    expect(batch({ now: WED_8PM_CHICAGO, clients: [sbx(13 * 60)], approved: approved(1) })).toHaveLength(1);
  });

  it('a real client never gets a clock offset or fast mode, even if the fields are set', () => {
    const real = client({ is_sandbox: false, clock_offset_minutes: 13 * 60, sandbox_fast: true });
    expect(batch({ now: '2026-11-05T02:00:00Z', clients: [real], approved: approved(1) })).toEqual([]);
  });
});

it('returns an explicit empty marker when nothing is sent', () => {
  const out = runNode(code, { 'Get All Approved Unsent': [], 'Get Sent Today': [], 'Get Client Timezones': [] }, { now: WED_10AM_CHICAGO });
  expect(out).toEqual([{ json: { _empty: true } }]);
});
