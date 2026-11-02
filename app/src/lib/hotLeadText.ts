import type { HotLead } from '../types';

type LeadText = Pick<HotLead, 'business_name' | 'ai_summary'>;

// When the summary step fails, ai_summary holds "<Business> replied: <the whole email>" (seen at
// 1,600 to 2,100 characters). That's the reply itself, not a summary, so it isn't shown as one.
const SUMMARY_MAX_CHARS = 400;

function pastedReply(lead: LeadText): string | null {
  const prefix = `${lead.business_name} replied:`;
  return lead.ai_summary?.startsWith(prefix) ? lead.ai_summary.slice(prefix.length).trim() : null;
}

/** The AI summary, or null when it's missing or is really the pasted reply. */
export function realSummary(lead: LeadText): string | null {
  const s = lead.ai_summary?.trim();
  if (!s || pastedReply(lead) !== null || s.length > SUMMARY_MAX_CHARS) return null;
  return s;
}

/** One-line text for lists: the summary, or what they wrote without the repeated business name. */
export function listExcerpt(lead: LeadText): string | null {
  return realSummary(lead) ?? pastedReply(lead) ?? lead.ai_summary ?? null;
}
