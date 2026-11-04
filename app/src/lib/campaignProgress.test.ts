import { describe, it, expect } from 'vitest';
import { campaignStage, progressSteps, type CampaignProgressInput } from './campaignProgress';

const base: CampaignProgressInput = { status: 'active', scrapeStatus: 'complete', prospects: 50, written: 50, awaiting: 0, sent: 0 };

describe('campaignStage', () => {
  it('in review before activation, and flags the slow note', () => {
    const s = campaignStage({ ...base, status: 'pending_review', prospects: 0, written: 0 });
    expect(s.key).toBe('in_review');
    expect(s.slow).toBe(true);
  });

  it('paused and finished campaigns say so whatever the counts', () => {
    expect(campaignStage({ ...base, status: 'paused', awaiting: 5 }).key).toBe('paused');
    expect(campaignStage({ ...base, status: 'cancelled' }).label).toBe('Cancelled');
  });

  it('a scrape error needs attention', () => {
    expect(campaignStage({ ...base, scrapeStatus: 'error' }).key).toBe('needs_attention');
  });

  it('researching while the scrape runs or before anything is found', () => {
    expect(campaignStage({ ...base, scrapeStatus: 'running' }).key).toBe('researching');
    expect(campaignStage({ ...base, scrapeStatus: 'idle', prospects: 0, written: 0 }).key).toBe('researching');
  });

  it('a finished scrape with no prospects needs attention', () => {
    expect(campaignStage({ ...base, prospects: 0, written: 0 }).key).toBe('needs_attention');
  });

  it('approval waiting wins over writing', () => {
    const s = campaignStage({ ...base, written: 20, awaiting: 12 });
    expect(s.key).toBe('awaiting_approval');
    expect(s.detail).toContain('12 prospects have');
  });

  it('writing until every prospect has an email, if nothing is sent yet', () => {
    const s = campaignStage({ ...base, written: 20 });
    expect(s.key).toBe('writing');
    expect(s.detail).toContain('20 of 50');
  });

  it('active once first emails are sent', () => {
    expect(campaignStage({ ...base, written: 30, sent: 30 }).key).toBe('sending');
  });

  it('ready when all written and approved but none sent', () => {
    expect(campaignStage(base).key).toBe('ready');
  });
});

describe('progressSteps', () => {
  it('marks steps done in order', () => {
    const steps = progressSteps({ ...base, written: 50, awaiting: 0, sent: 10 });
    expect(steps.map((s) => s.done)).toEqual([true, true, true, false]);
    expect(steps.map((s) => s.count)).toEqual([50, 50, 0, 10]);
  });

  it('nothing done on an empty campaign', () => {
    expect(progressSteps({ ...base, prospects: 0, written: 0 }).every((s) => !s.done)).toBe(true);
  });
});
