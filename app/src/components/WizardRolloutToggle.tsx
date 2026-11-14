import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FlaskConical, Users } from 'lucide-react';
import { useWizardRollout } from '../hooks/useWizardRollout';
import { ConfirmDialog } from './ConfirmDialog';

/* Admin: who sees the campaign wizard. On = sandbox accounts only; off = every client.
   Taking it to everyone asks first, because it also lets their campaigns skip staff review. */
export function WizardRolloutToggle({ onChanged }: { onChanged?: (message: string, tone?: 'error') => void }) {
  const { sandboxOnly, loading, error, setSandboxOnly } = useWizardRollout();
  const [confirmEveryone, setConfirmEveryone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function apply(next: boolean) {
    setBusy(true);
    const { error: err } = await setSandboxOnly(next);
    setBusy(false);
    setConfirmEveryone(false);
    if (err) onChanged?.(`Couldn't change who sees the campaign wizard: ${err}`, 'error');
    else onChanged?.(next ? 'Campaign wizard: sandbox accounts only.' : 'Campaign wizard: on for every client.');
  }

  if (error) {
    return (
      <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[13px] text-(--ad-ink-soft)">
        Couldn't read the campaign wizard setting: {error}
      </div>
    );
  }

  const on = sandboxOnly !== false; // sandbox-only until it has loaded
  const Icon = on ? FlaskConical : Users;

  return (
    <>
      <div className="flex items-start justify-between gap-4 rounded-xl border border-(--ad-line) bg-(--ad-surface) px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--ad-purple-tint) text-(--ad-purple)">
            <Icon size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[14px] font-semibold text-(--ad-ink)">
              Campaign wizard: {loading ? '…' : on ? 'sandbox accounts only' : 'every client'}
            </p>
            <p className="m-0 mt-0.5 text-[12.5px] leading-relaxed text-(--ad-ink-soft)">
              {on
                ? 'Only sandbox accounts see the wizard. Real clients create campaigns the usual way, with staff review. Turn this off to give it to everyone.'
                : 'Every client sees the wizard and their campaigns skip staff review, except clients you switched it off for on the Clients page.'}
            </p>
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-[12.5px] font-semibold text-(--ad-ink-soft)">
          <span className="hidden sm:inline">Sandbox only</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Campaign wizard for sandbox accounts only"
            onClick={() => (on ? setConfirmEveryone(true) : void apply(true))}
            disabled={loading || busy}
            className="relative h-6 w-11 cursor-pointer rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: on ? 'var(--ad-green)' : 'var(--ad-line)' }}
          >
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-(--ad-surface) shadow-sm transition-all" style={{ left: on ? 22 : 2 }} />
          </button>
        </label>
      </div>

      <AnimatePresence>
        {confirmEveryone && (
          <ConfirmDialog
            title="Give the campaign wizard to every client?"
            confirmLabel="Give it to everyone"
            busy={busy}
            onConfirm={() => void apply(false)}
            onCancel={() => setConfirmEveryone(false)}
          >
            Every client sees the wizard straight away, except ones you switched it off for on the Clients page.
            Campaigns they create, with the wizard or by hand, go live without staff review.
            You can switch back to sandbox-only at any time.
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </>
  );
}
