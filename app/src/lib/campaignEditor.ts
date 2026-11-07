// Campaign editor rules (docs/CAMPAIGN_WIZARD_BUILD_PLAN.md, M4). The server checks the same
// things before launch (campaign_launch_problems); these give instant feedback while editing.

export interface Email { subject: string; body: string }

export const EMAIL_LABELS = ['First email', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3'];

/** Today's cadence, unchanged by the wizard: business days after the previous email. */
export const CADENCE: { label: string; when: string }[] = [
  { label: 'First email', when: 'When the campaign starts sending, after you approve it in Approvals' },
  { label: 'Follow-up 1', when: '3 business days after the first email' },
  { label: 'Follow-up 2', when: '5 business days after follow-up 1' },
  { label: 'Follow-up 3', when: '7 business days after follow-up 2' },
];

export const PLACEHOLDERS = ['first_name', 'company_name', 'sender_name'] as const;

/** Always four emails, padding with blanks, so the editor shows every step. */
export function emailsFrom(sequence: unknown): Email[] {
  const list = Array.isArray(sequence) ? sequence : [];
  return Array.from({ length: 4 }, (_, i) => {
    const e = list[i] as Partial<Email> | undefined;
    return { subject: typeof e?.subject === 'string' ? e.subject : '', body: typeof e?.body === 'string' ? e.body : '' };
  });
}

/** Placeholders the email writer can't fill, e.g. {{price}}. */
export function unknownPlaceholders(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p)))];
}

export interface EmailProblem { step: number; message: string }

export function emailProblems(emails: Email[]): EmailProblem[] {
  const out: EmailProblem[] = [];
  emails.forEach((e, i) => {
    const label = EMAIL_LABELS[i] ?? `Email ${i + 1}`;
    if (!e.subject.trim() && !e.body.trim()) out.push({ step: i, message: `${label} is empty.` });
    else if (!e.subject.trim()) out.push({ step: i, message: `${label} needs a subject.` });
    else if (!e.body.trim()) out.push({ step: i, message: `${label} needs a body.` });
    const bad = unknownPlaceholders(`${e.subject} ${e.body}`);
    if (bad.length) out.push({ step: i, message: `${label} uses ${bad.map((b) => `{{${b}}}`).join(', ')}, which we can't fill in. Use {{first_name}}, {{company_name}} or {{sender_name}}.` });
  });
  return out;
}

export type LifecycleAction = 'pause' | 'resume' | 'unschedule' | 'archive' | 'restore';

/** Which lifecycle buttons a campaign shows, by status (the server enforces the same rules). */
export function lifecycleActions(status: string): LifecycleAction[] {
  switch (status) {
    case 'active': return ['pause', 'archive'];
    case 'paused': return ['resume', 'archive'];
    case 'scheduled': return ['unschedule', 'archive'];
    case 'archived': return ['restore'];
    case 'draft':
    case 'pending_review':
    case 'completed': return ['archive'];
    default: return [];
  }
}

export const LIFECYCLE_LABEL: Record<LifecycleAction, string> = {
  pause: 'Pause', resume: 'Resume', unschedule: 'Cancel the start date', archive: 'Archive', restore: 'Restore',
};

export function isLaunchable(status: string): boolean {
  return status === 'draft' || status === 'pending_review' || status === 'scheduled';
}

export function hasLaunched(status: string): boolean {
  return status === 'active' || status === 'paused' || status === 'completed';
}

/** "Starts Nov 1, 2027" for a future date, otherwise null. */
export function startLabel(startDate: string | null, today = new Date()): string | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(today); t.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  if (day <= t) return null;
  return `Starts ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
