import { describe, it, expect } from 'vitest';
import { BLOCK_INFO, POLICY_HELD_REASONS, isPolicyHeld } from './blockReasons';

describe('isPolicyHeld', () => {
  it('holds generic mailboxes and freemail addresses', () => {
    expect(isPolicyHeld('generic_mailbox')).toBe(true);
    expect(isPolicyHeld('freemail_address')).toBe(true);
  });

  it('keeps every other block reason visible', () => {
    const others = Object.keys(BLOCK_INFO).filter((r) => r !== 'generic_mailbox' && r !== 'freemail_address');
    for (const reason of others) expect(isPolicyHeld(reason)).toBe(false);
    // Reasons the view returns that this build has no copy for (e.g. followups_stopped).
    expect(isPolicyHeld('followups_stopped')).toBe(false);
  });

  it('is false for empty values', () => {
    expect(isPolicyHeld(null)).toBe(false);
    expect(isPolicyHeld(undefined)).toBe(false);
    expect(isPolicyHeld('')).toBe(false);
  });

  it('lists exactly the two held reasons', () => {
    expect([...POLICY_HELD_REASONS].sort()).toEqual(['freemail_address', 'generic_mailbox']);
  });
});
