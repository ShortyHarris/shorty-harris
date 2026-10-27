import { describe, it, expect } from 'vitest';
import { summarizeRebuild } from './rebuildSummary';

const keys = ['target_business_types', 'decision_maker_roles', 'pain_points'];

describe('summarizeRebuild', () => {
  it('separates filled, skipped (edited) and still-empty fields', () => {
    const before = { edited_fields: ['pain_points'], target_business_types: [], decision_maker_roles: [], pain_points: ['mine'] };
    const after = { edited_fields: ['pain_points'], target_business_types: ['Dental practice'], decision_maker_roles: [], pain_points: ['mine'] };
    expect(summarizeRebuild(before, after, keys)).toEqual({
      filled: ['target_business_types'],
      skippedEdited: ['pain_points'],
      stillEmpty: ['decision_maker_roles'],
    });
  });

  it('reports an edited-but-empty field as skipped, not filled', () => {
    const before = { edited_fields: ['target_business_types'], target_business_types: [] };
    const after = { edited_fields: ['target_business_types'], target_business_types: [] };
    expect(summarizeRebuild(before, after, ['target_business_types']).skippedEdited).toEqual(['target_business_types']);
  });

  it('does not call unchanged non-empty values filled', () => {
    const same = { edited_fields: [], pain_points: ['a'] };
    expect(summarizeRebuild(same, { ...same }, ['pain_points'])).toEqual({ filled: [], skippedEdited: [], stillEmpty: [] });
  });
});
