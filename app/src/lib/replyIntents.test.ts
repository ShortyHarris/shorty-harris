import { describe, expect, it } from 'vitest';
import { filterReplies, intentStyle, isNonReplyIntent, pct, replyGroup, snippet, summarizeReplies, type ReplyRecord } from './replyIntents';

const rec = (id: string, intent: string | null, body = 'hi'): ReplyRecord => ({
  id, intent, body, at: '2026-10-01T00:00:00Z', prospectName: `P${id}`,
});

const replies = [
  rec('1', 'automated'), rec('2', 'auto_reply'), rec('3', 'out_of_office'),
  rec('4', 'bounced'), rec('5', 'interested'), rec('6', 'interested'), rec('7', 'stop'), rec('8', null),
];

describe('replyIntents', () => {
  it('groups the three automated intents together', () => {
    expect(['automated', 'auto_reply', 'out_of_office'].map(replyGroup)).toEqual(['automated', 'automated', 'automated']);
  });

  it('counts human replies only in the headline and ignores unclassified', () => {
    const s = summarizeReplies(replies);
    expect(s.human).toBe(3);
    expect(s.automated).toBe(3);
    expect(s.bounced).toBe(1);
    expect(s.total).toBe(8);
  });

  it('filters by group, defaulting to real replies', () => {
    expect(filterReplies(replies, null).map((r) => r.id)).toEqual(['5', '6', '7']);
    expect(filterReplies(replies, 'automated')).toHaveLength(3);
    expect(filterReplies(replies, 'bounced')).toHaveLength(1);
    expect(filterReplies(replies, 'interested')).toHaveLength(2);
  });

  it('truncates snippets to 120 characters and rounds percentages', () => {
    expect(snippet('x'.repeat(200))).toHaveLength(121);
    expect(snippet('  a \n b ')).toBe('a b');
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBe(0);
  });

  it('maps every DB intent to a group; unknown values become other, not dropped', () => {
    const known = ['interested', 'question', 'resend_request', 'referred', 'maybe', 'not_interested', 'stop',
      'wrong_person', 'out_of_office', 'automated', 'auto_reply', 'bounced', 'uncertain'];
    expect(known.map(replyGroup).every((g) => g !== null)).toBe(true);
    expect(replyGroup('uncertain')).toBe('uncertain');
    expect(replyGroup('something_new')).toBe('other');
    expect(intentStyle('something_new').label).toBe('Other');
    expect(intentStyle('resend_request').label).toBe('Resend request');
    const s = summarizeReplies([rec('a', 'question'), rec('b', 'referred'), rec('c', 'uncertain'), rec('d', 'weird')]);
    expect(s).toMatchObject({ human: 2, uncertain: 1, other: 1, total: 4 });
  });

  it('excludes automated, bounced and uncertain from real-reply counts', () => {
    expect(['automated', 'auto_reply', 'out_of_office', 'bounced', 'uncertain'].every(isNonReplyIntent)).toBe(true);
    expect(['question', 'maybe', 'stop', null].some(isNonReplyIntent)).toBe(false);
  });

  it('treats existing_conversation as a human reply that is not in reply rates', () => {
    expect(replyGroup('existing_conversation')).toBe('existing_conversation');
    expect(intentStyle('existing_conversation').label).toBe('Existing conversation');
    expect(isNonReplyIntent('existing_conversation')).toBe(true);
    const s = summarizeReplies([rec('a', 'existing_conversation'), rec('b', 'question')]);
    expect(s).toMatchObject({ human: 2, other: 0, total: 2 });
  });
});
