import { describe, it, expect } from 'vitest';
import { APPROVAL_TYPE_LABEL, APPROVAL_STEP_ORDER, approvalTypeLabel, APPROVAL_EXPLAINER } from './approvalLabels';

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
