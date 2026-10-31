import { describe, it, expect } from 'vitest';
import heldDraftsSource from './HeldDrafts.tsx?raw';

// HeldDrafts points an admin at a live client's approval queue. It is safe only because it has no
// way to change anything. This guard reads the source (no rendering) and fails the moment a write
// path is wired in: a mutation hook or action, a direct table write, or a confirm/edit dialog.

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Identifiers that perform or front a write on drafts or sequences.
const FORBIDDEN_IDENTIFIERS = [
  'useClientApprovals', 'useApprovalQueue', 'useSequenceActions',
  'approve', 'reject', 'bulkApprove', 'bulkReject', 'saveEdits', 'saveDraftEdits',
  'approveSequences', 'approveOneEmail', 'saveStepEdit', 'setSequencePaused', 'stopFollowups',
  'cancelUnsentSequence', 'resolveUncertainReply', 'ConfirmDialog', 'EditModal', 'runInChunks',
];
// Direct database access: the screen may only call the read-only approved_queue via fetchApprovedQueue.
const FORBIDDEN_CALLS = [/\.update\s*\(/, /\.insert\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/, /\.rpc\s*\(/, /\.from\s*\(/];
// From the approvals hook module (which also exports the mutations) only this read function may be imported.
const ALLOWED_FROM_APPROVALS_HOOK = new Set(['fetchApprovedQueue', 'ApprovedQueueTab']);

export function findWriteViolations(source: string): string[] {
  const src = stripComments(source);
  const found: string[] = [];

  // Module path strings are not identifiers: importing the read function from the approvals hook
  // file must not trip on the file's own name. What is imported is checked separately below.
  const code = src.replace(/(from\s+)(['"])[^'"]*\2/g, '$1""');
  for (const id of FORBIDDEN_IDENTIFIERS) {
    if (new RegExp(`\\b${id}\\b`).test(code)) found.push(`references ${id}`);
  }
  for (const re of FORBIDDEN_CALLS) {
    if (re.test(src)) found.push(`calls ${re.source}`);
  }

  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][^'"]*hooks\/useClientApprovals['"]/g;
  for (const m of src.matchAll(importRe)) {
    for (const raw of m[1].split(',')) {
      const name = raw.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name && !ALLOWED_FROM_APPROVALS_HOOK.has(name)) found.push(`imports ${name} from the approvals hook`);
    }
  }

  // A button other than plain pagination is a control; Previous/Next are the only ones allowed.
  for (const m of src.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
    if (!/>\s*(Previous|Next)\s*</.test(m[0])) found.push('renders a button that is not Previous/Next');
  }
  return found;
}

describe('HeldDrafts is read-only', () => {
  it('has no mutation hook, write call, dialog or action control in its source', () => {
    expect(findWriteViolations(heldDraftsSource)).toEqual([]);
  });

  it('still imports only the read function from the approvals hook', () => {
    expect(heldDraftsSource).toMatch(/import\s*\{\s*fetchApprovedQueue,\s*type ApprovedQueueTab\s*\}\s*from\s*'\.\.\/\.\.\/hooks\/useClientApprovals'/);
  });
});

describe('the read-only guard actually catches write paths', () => {
  it.each([
    ["import { useClientApprovals } from '../../hooks/useClientApprovals';", 'useClientApprovals'],
    ["import { fetchApprovedQueue, bulkApprove } from '../../hooks/useClientApprovals';", 'bulkApprove'],
    ["import { approveSequences } from '../../hooks/useSequenceActions';", 'approveSequences'],
    ["await supabase.from('messages').update({ approval_status: 'rejected' });", '.update'],
    ["await supabase.rpc('approve_sequences', {});", '.rpc'],
    ['<button onClick={() => doThing()}>Reject</button>', 'button'],
    ['<ConfirmDialog title="x" />', 'ConfirmDialog'],
  ])('flags %s', (snippet, needle) => {
    const hits = findWriteViolations(snippet);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(' ')).toContain(needle);
  });

  it('ignores a comment that merely mentions approve/reject', () => {
    expect(findWriteViolations('/* no approve, reject or edit control */\n// approve nothing\nconst x = 1;')).toEqual([]);
  });
});
