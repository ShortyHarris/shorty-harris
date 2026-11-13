import { describe, it, expect } from 'vitest';
import { describeApprovalsLoadError, describeWriteError, isServerBusyError } from './approvalErrors';

describe('approval error copy (13 Nov 2026: raw "statement timeout" read as "approving failed")', () => {
  it('a statement timeout says the server was busy and that decisions are saved', () => {
    const text = describeApprovalsLoadError('canceling statement due to statement timeout');
    expect(text).toMatch(/server is busy/);
    expect(text).toMatch(/already approved or rejected are saved/);
    expect(text).not.toMatch(/canceling statement/);
  });

  it('pool exhaustion and gateway timeouts count as busy', () => {
    expect(isServerBusyError('Timed out acquiring connection from connection pool.')).toBe(true);
    expect(isServerBusyError('PGRST003')).toBe(true);
    expect(isServerBusyError('Gateway Timeout')).toBe(true);
    expect(isServerBusyError('permission denied for table messages')).toBe(false);
  });

  it('Safari "Load failed" reads as no connection', () => {
    expect(describeApprovalsLoadError('TypeError: Load failed')).toMatch(/no connection/);
  });

  it('anything else is shown as it is', () => {
    expect(describeApprovalsLoadError('not_permitted')).toBe("Couldn't load your approvals: not_permitted");
  });

  it('a timed-out write does not claim whether it landed', () => {
    const text = describeWriteError("RequestTimeoutError: The server didn't answer within 25 seconds.");
    expect(text).toMatch(/didn't answer in time/);
    expect(text).toMatch(/if the draft is still there, try again/);
  });
});
