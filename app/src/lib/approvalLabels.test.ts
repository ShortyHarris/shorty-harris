import { describe, it, expect } from 'vitest';
import {
  APPROVAL_TYPE_LABEL, APPROVAL_STEP_ORDER, approvalTypeLabel, APPROVAL_EXPLAINER,
  rejectedTotalsLine, bulkApproveBlockedReason, REJECTED_BY_PERSON, signOffMissingLine, SIGN_OFF_MISSING_BADGE,
} from './approvalLabels';

describe('approval type labels', () => {
  it('names the four steps First Touch and Follow-Up 1-3', () => {
    expect(APPROVAL_TYPE_LABEL).toEqual({
      initial: 'First Touch',
      follow_up_d3: 'Follow-Up 1',
      follow_up_d7: 'Follow-Up 2',
      follow_up_d14: 'Follow-Up 3',
    });
  });

  it('has a label for every step in sequence order', () => {
    expect(APPROVAL_STEP_ORDER.map(approvalTypeLabel)).toEqual(['First Touch', 'Follow-Up 1', 'Follow-Up 2', 'Follow-Up 3']);
  });

  it('falls back to the raw value for unknown types', () => {
    expect(approvalTypeLabel('follow_up_d30')).toBe('follow_up_d30');
  });

  it('describes follow-ups as 3, 5 and 7 business days after the previous email', () => {
    expect(APPROVAL_EXPLAINER).toContain('3, 5 and 7 business days after the previous email');
  });
});

describe('rejected totals', () => {
  it('counts only drafts a person turned down as rejected', () => {
    expect(REJECTED_BY_PERSON).toEqual(['manual', 'unknown']);
  });

  it('shows replaced and auto-cancelled drafts separately, and only when there are any', () => {
    expect(rejectedTotalsLine({ rejectedTotal: 9, replacedTotal: 237, autoCancelledTotal: 0 }))
      .toBe('9 rejected all time · 237 replaced by rewrites');
    expect(rejectedTotalsLine({ rejectedTotal: 0, replacedTotal: 0, autoCancelledTotal: 3 }))
      .toBe('0 rejected all time · 3 cancelled automatically');
    expect(rejectedTotalsLine({ rejectedTotal: 4, replacedTotal: 0, autoCancelledTotal: 0 }))
      .toBe('4 rejected all time');
  });
});

describe('why bulk Approve is off', () => {
  const base = { selectedCount: 0, gmailMissing: false, capped: false, loaded: 50, totalPending: 50 };

  it('is null when Approve can be used', () => {
    expect(bulkApproveBlockedReason(base)).toBeNull();
    expect(bulkApproveBlockedReason({ ...base, selectedCount: 3, capped: true })).toBeNull();
  });

  it('says Gmail must be connected, and that rejecting will not approve a selection', () => {
    expect(bulkApproveBlockedReason({ ...base, gmailMissing: true })?.kind).toBe('gmail');
    expect(bulkApproveBlockedReason({ ...base, gmailMissing: true, selectedCount: 5 })?.text)
      .toContain("Rejecting won't approve them");
  });

  it('explains the load cap when nothing is selected', () => {
    const r = bulkApproveBlockedReason({ ...base, capped: true, loaded: 200, totalPending: 340 });
    expect(r?.kind).toBe('capped');
    expect(r?.text).toContain('Only 200 of 340 drafts are loaded');
  });
});

describe('sign-off without the sender name', () => {
  it('says nothing when every draft is signed with the name', () => {
    expect(signOffMissingLine(0)).toBeNull();
  });

  it('counts the drafts and points at the row badge', () => {
    expect(signOffMissingLine(9)).toContain("9 drafts don't end with your name");
    expect(signOffMissingLine(9)).toContain(SIGN_OFF_MISSING_BADGE);
    expect(signOffMissingLine(1)).toContain("1 draft doesn't");
  });
});
