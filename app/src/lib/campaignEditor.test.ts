import { describe, expect, it } from 'vitest';
import {
  CADENCE, emailProblems, emailsFrom, hasLaunched, isLaunchable, lifecycleActions, startLabel, unknownPlaceholders,
} from './campaignEditor';

describe('emailsFrom', () => {
  it('always gives four emails', () => {
    expect(emailsFrom(null)).toHaveLength(4);
    const e = emailsFrom([{ subject: 'Hi', body: 'Hello' }, { subject: 5 }]);
    expect(e[0]).toEqual({ subject: 'Hi', body: 'Hello' });
    expect(e[1]).toEqual({ subject: '', body: '' });
    expect(e[3]).toEqual({ subject: '', body: '' });
  });
});

describe('emailProblems', () => {
  it('names blank and half-filled emails', () => {
    const p = emailProblems([
      { subject: 'Hi', body: 'Hello {{first_name}}' },
      { subject: '', body: 'x' },
      { subject: 'y', body: ' ' },
      { subject: '', body: '' },
    ]);
    expect(p.map((x) => x.message)).toEqual(['Follow-up 1 needs a subject.', 'Follow-up 2 needs a body.', 'Follow-up 3 is empty.']);
  });

  it('flags placeholders we cannot fill', () => {
    expect(unknownPlaceholders('Hi {{first_name}}, {{ price }} and {{price}}')).toEqual(['price']);
    const p = emailProblems([{ subject: 'Hi {{city}}', body: 'b' }, ...emailsFrom([{ subject: 's', body: 'b' }, { subject: 's', body: 'b' }, { subject: 's', body: 'b' }]).slice(0, 3)]);
    expect(p).toHaveLength(1);
    expect(p[0].message).toContain('{{city}}');
  });
});

describe('cadence and lifecycle', () => {
  it('describes today\'s rule: 3, 5, 7 business days', () => {
    expect(CADENCE.map((c) => c.when.match(/^\d/)?.[0] ?? '-')).toEqual(['-', '3', '5', '7']);
  });

  it('offers only the actions the server allows', () => {
    expect(lifecycleActions('active')).toEqual(['pause', 'archive']);
    expect(lifecycleActions('paused')).toEqual(['resume', 'archive']);
    expect(lifecycleActions('scheduled')).toEqual(['unschedule', 'archive']);
    expect(lifecycleActions('archived')).toEqual(['restore']);
    expect(lifecycleActions('weird')).toEqual([]);
    expect(isLaunchable('draft')).toBe(true);
    expect(isLaunchable('active')).toBe(false);
    expect(hasLaunched('paused')).toBe(true);
  });

  it('labels only future start dates', () => {
    const today = new Date('2026-11-07T10:00:00');
    expect(startLabel('2026-12-01', today)).toBe('Starts Dec 1, 2026');
    expect(startLabel('2026-11-07', today)).toBeNull();
    expect(startLabel(null, today)).toBeNull();
    expect(startLabel('nonsense', today)).toBeNull();
  });
});
