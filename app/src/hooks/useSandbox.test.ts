import { describe, expect, it } from 'vitest';
import {
  nextStepLabel, nextStepBlock, hasSent, sentCount, describeResult, clockAheadLabel, sandboxTimeLabel,
  type SandboxProspect, type SandboxMessage,
} from './useSandbox';

const msg = (approval_status: string, send_status: string): SandboxMessage => ({
  approval_status, send_status, message_type: 'initial', created_at: '2026-11-04T00:00:00Z',
});
const prospect = (pipeline_status: string, messages: SandboxMessage[]): SandboxProspect => ({
  id: 'p1', business_name: 'Alpine Dental Studio', email: 'me+sbx-01@example.com', pipeline_status, messages,
});

describe('nextStepLabel', () => {
  it('follows the same branch order as sandbox_next_step', () => {
    expect(nextStepLabel(prospect('new', []))).toBe('Write first email');
    expect(nextStepLabel(prospect('message_pending', [msg('pending', 'not_sent')]))).toBe('Approve draft');
    expect(nextStepLabel(prospect('message_pending', [msg('approved', 'not_sent')]))).toBe('Send it');
    expect(nextStepLabel(prospect('contacted', [msg('approved', 'sent')]))).toBe('Skip to next follow-up');
  });

  it('prefers a waiting draft over making a follow-up due', () => {
    expect(nextStepLabel(prospect('contacted', [msg('approved', 'sent'), msg('pending', 'not_sent')]))).toBe('Approve draft');
  });

  it('has nothing to offer once a prospect is finished', () => {
    for (const s of ['bounced', 'won', 'lost']) expect(nextStepLabel(prospect(s, [msg('approved', 'sent')]))).toBeNull();
  });
});

describe('nextStepBlock', () => {
  it('explains that a hot lead gets no more follow-ups', () => {
    const p = prospect('hot_lead', [msg('approved', 'sent')]);
    expect(nextStepBlock(p)?.label).toBe('Hot lead: no more follow-ups');
    expect(nextStepLabel(p)).toBeNull();
  });

  it('blocks once follow-ups are stopped and something was sent', () => {
    const p = { ...prospect('contacted', [msg('approved', 'sent')]), followups_stopped: true };
    expect(nextStepBlock(p)?.label).toBe('Follow-ups stopped');
  });

  it('lets an out-of-office reply carry on with the sequence (status unchanged)', () => {
    const p = { ...prospect('contacted', [msg('approved', 'sent')]), followups_stopped: false };
    expect(nextStepBlock(p)).toBeNull();
    expect(nextStepLabel(p)).toBe('Skip to next follow-up');
  });

  it('stops after a real reply such as a question', () => {
    expect(nextStepBlock(prospect('replied', [msg('approved', 'sent')]))?.label).toBe('Replied: waiting on you');
  });

  it('shows that an unsubscribed address is blocked for good', () => {
    const p = { ...prospect('replied', [msg('approved', 'sent')]), followups_stopped: true, do_not_contact: true };
    expect(nextStepBlock(p)?.label).toBe('Unsubscribed: all emails blocked');
  });

  it('does not block before anything was sent', () => {
    expect(nextStepBlock({ ...prospect('new', []), followups_stopped: true })).toBeNull();
  });
});

describe('hasSent / sentCount', () => {
  it('only counts messages that actually went out', () => {
    const p = prospect('contacted', [msg('approved', 'sent'), msg('approved', 'failed'), msg('pending', 'not_sent')]);
    expect(hasSent(p)).toBe(true);
    expect(sentCount(p)).toBe(1);
    expect(hasSent(prospect('new', []))).toBe(false);
  });
});

describe('describeResult', () => {
  it('summarises a reset', () => {
    expect(describeResult({ ok: true, prospects: 20, addressed_to: 'me+sbx-NN@example.com' }))
      .toBe('Reset done. 20 fresh prospects, all addressed to me+sbx-NN@example.com.');
  });

  it('shows the RPC detail or note on success', () => {
    expect(describeResult({ ok: true, did: 'approved_draft', detail: 'Approved. Press again to send it.' }))
      .toBe('Approved. Press again to send it.');
    expect(describeResult({ ok: true, note: 'Recorded.' })).toBe('Recorded.');
  });

  it('prefers the hint on failure, so a missing mailbox explains itself', () => {
    expect(describeResult({ ok: false, error: 'no_mailbox_connected', hint: 'Connect a Gmail account first.' }))
      .toBe('Connect a Gmail account first.');
  });

  it('translates the known error codes', () => {
    expect(describeResult({ ok: false, error: 'nothing_to_do' })).toBe('Nothing to do for this prospect right now.');
    expect(describeResult({ ok: false, error: 'not_a_sandbox_client' })).toBe('This only works on a sandbox account.');
    expect(describeResult({ ok: false, error: 'weird' })).toBe('Could not do that (weird).');
  });
});

describe('clockAheadLabel', () => {
  it('reads days and hours', () => {
    expect(clockAheadLabel(0)).toBe('today');
    expect(clockAheadLabel(60)).toBe('1 hour ahead');
    expect(clockAheadLabel(1440)).toBe('1 day ahead');
    expect(clockAheadLabel(2 * 1440 + 180)).toBe('2 days 3 hours ahead');
    expect(clockAheadLabel(25)).toBe('25 min ahead');
  });
});

describe('sandboxTimeLabel', () => {
  const now = new Date('2026-11-05T21:00:00Z'); // Thu 15:00 in Chicago
  it('shows the sandbox clock in the account time zone', () => {
    expect(sandboxTimeLabel(0, 'America/Chicago', now)).toBe('Thu 5 Nov, 15:00');
    expect(sandboxTimeLabel(180, 'America/Chicago', now)).toBe('Thu 5 Nov, 18:00');
    expect(sandboxTimeLabel(18 * 60, 'America/Chicago', now)).toBe('Fri 6 Nov, 09:00');
  });
  it('falls back to Chicago for an unknown time zone', () => {
    expect(sandboxTimeLabel(0, 'Not/AZone', now)).toBe('Thu 5 Nov, 15:00');
  });
});
