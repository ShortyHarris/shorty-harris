import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useUpcomingEmails, FAILED_WINDOW_DAYS } from '../hooks/useUpcomingEmails';
import { browserTimeZone } from '../lib/approvalsView';

/**
 * Client dashboard card: approved emails going out today, tomorrow and later this
 * week, plus what is waiting for approval, held back, or failed. Figures come from
 * the same approvals_schedule RPC as the Approvals page, so the two always agree.
 */
export function UpcomingEmails({
  clientId, client = supabase, timeZone, approvalsHref,
}: { clientId: string; client?: SupabaseClient; timeZone?: string | null; approvalsHref: string }) {
  const tz = timeZone || browserTimeZone();
  const { summary: s, failed } = useUpcomingEmails(clientId, tz, client);

  if (!s) return null;
  const scheduled = s.today + s.tomorrow + s.laterThisWeek + s.later;
  if (scheduled + s.awaitingApproval + s.held + failed === 0) return null;

  const next = s.nextSendAt
    ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(s.nextSendAt))
    : null;

  const tiles: { label: string; value: number; note?: string }[] = [
    { label: 'Going out today', value: s.today },
    { label: 'Tomorrow', value: s.tomorrow },
    { label: 'Later this week', value: s.laterThisWeek },
    { label: 'Awaiting your approval', value: s.awaitingApproval },
    { label: 'On hold', value: s.held, note: 'Held by sending rules, a paused mailbox, or waiting on an earlier email' },
    { label: `Failed (last ${FAILED_WINDOW_DAYS} days)`, value: failed },
  ];

  return (
    <section aria-label="Upcoming emails" className="rounded-xl border border-(--ad-line) bg-(--ad-surface) px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[14px] font-semibold text-(--ad-ink)">Upcoming emails</h2>
        <Link to={approvalsHref} className="text-[12.5px] font-semibold text-(--ad-green) hover:underline">See each email</Link>
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-(--ad-ink-soft)">
        {next ? `Next email goes out ${next}.` : 'Nothing approved is scheduled yet.'}
        {s.later > 0 && ` ${s.later} more after this week.`} Times are estimates.
      </p>
      <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <li key={t.label} title={t.note} className="rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-2.5 py-2">
            <div className={`text-[16px] font-extrabold ${t.value > 0 ? 'text-(--ad-ink)' : 'text-(--ad-ink-soft)'}`}>{t.value.toLocaleString()}</div>
            <div className="text-[11px] leading-snug text-(--ad-ink-soft)">{t.label}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
