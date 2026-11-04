import { describe, expect, it } from 'vitest';
import { nextStepLabel, hasSent, sentCount, describeResult, type SandboxProspect, type SandboxMessage } from './useSandbox';

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
    expect(nextStepLabel(prospect('contacted', [msg('approved', 'sent')]))).toBe('Make follow-up due');
  });

  it('prefers a waiting draft over making a follow-up due', () => {
    expect(nextStepLabel(prospect('contacted', [msg('approved', 'sent'), msg('pending', 'not_sent')]))).toBe('Approve draft');
  });

  it('has nothing to offer once a prospect is finished', () => {
    for (const s of ['bounced', 'won', 'lost']) expect(nextStepLabel(prospect(s, [msg('approved', 'sent')]))).toBeNull();
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
