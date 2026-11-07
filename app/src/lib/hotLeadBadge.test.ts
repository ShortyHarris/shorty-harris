import { describe, it, expect } from 'vitest';
import { newHotLeadAlertCount } from './hotLeadBadge';

describe('admin Hot Leads alert count', () => {
  it('counts new leads of real clients only', () => {
    expect(newHotLeadAlertCount([
      { status: 'new', client: { is_sandbox: false } },
      { status: 'new', client: { is_sandbox: true } },   // sandbox test lead: not an alert
      { status: 'contacted', client: { is_sandbox: false } },
      { status: 'new', client: null },                    // client unknown: still counted
    ])).toBe(2);
  });
});
