import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scheduledDisplay, formatPendingSince, calendarDaysBetween, pendingSinceOf, type ScheduleMap, type SortableApproval } from '../lib/approvalsView';

// Shared by the client Approvals page and the admin queue.

export function ScheduledCell({ schedule, id, tz, now }: { schedule: ScheduleMap; id: string; tz: string; now: Date }) {
  const d = scheduledDisplay(schedule.get(id), tz, now);
  return (
    <span
      title={d.title ?? undefined}
      className={d.overdue ? 'font-bold text-[#a8533a]' : d.hasDate ? '' : 'italic opacity-70'}
    >
      {d.text}
      {d.overdue && <span className="ml-1 rounded-full bg-[#f6e8e2] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[.04em]">Overdue</span>}
    </span>
  );
}

/**
 * Approved (or pending) but will not send because of the client's send rules.
 * Admin-only: clients never see held messages.
 * settingsPath: undefined shows no hint, null a plain "See Settings", a path links to it.
 */
export function HeldBadge({ row, settingsPath, className = '' }: {
  row: { basis: string | null } | undefined; settingsPath?: string | null; className?: string;
}) {
  if (!row || row.basis !== 'held_by_send_rules') return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#f8efdb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em] text-[#8a6417]">
        Held by send rules
      </span>
      {settingsPath !== undefined && (
        <span className="text-[11px] leading-snug text-[#8a6417]">
          {settingsPath ? <Link to={settingsPath} className="font-bold underline">See Settings</Link> : 'See Settings'}
        </span>
      )}
    </div>
  );
}

const STALE_DAYS = 3;

/** Compact "2d" / "5h" wait time; the full date is in the tooltip. Turns loud once a draft is stale. */
export function WaitingCell({ item, schedule, tz, now, staleClassName = 'font-bold text-(--ad-amber)' }: {
  item: SortableApproval; schedule: ScheduleMap; tz: string; now: Date; staleClassName?: string;
}) {
  const iso = pendingSinceOf(item, schedule);
  const since = new Date(iso);
  if (!iso || Number.isNaN(since.getTime())) return <span>-</span>;
  // Calendar days in the business timezone, the same count PendingCell and the tooltip use.
  const days = calendarDaysBetween(since, now, tz);
  const text = days >= 1 ? `${days}d` : 'Today';
  return (
    <span title={formatPendingSince(iso, tz, now)} className={days >= STALE_DAYS ? staleClassName : undefined}>
      {text}
    </span>
  );
}

export function PendingCell({ item, schedule, tz, now }: { item: SortableApproval; schedule: ScheduleMap; tz: string; now: Date }) {
  return <>{formatPendingSince(pendingSinceOf(item, schedule), tz, now)}</>;
}

/** Small SOCIAL / GEO tag for the personalization angle; renders nothing without one. */
export function AnglePill({ angle, className = '' }: { angle: string | null | undefined; className?: string }) {
  const text = angle?.trim();
  if (!text) return null;
  return (
    <span
      title="Personalization angle"
      className={`atbl-pill ${className}`}
      style={{ background: '#eef1f8', color: '#3b5b9a' }}
    >
      {text.toUpperCase()}
    </span>
  );
}

/** Only http(s) URLs may become links; anything else (javascript:, data:, junk) is dropped. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** Observation text and its source link for the review modals' details grid; nothing when both are empty. */
export function ObservationDetails({ observation, sourceUrl, Detail }: {
  observation: string | null | undefined;
  sourceUrl: string | null | undefined;
  Detail: (props: { label: string; children?: ReactNode }) => ReactNode;
}) {
  const text = observation?.trim();
  const href = safeHttpUrl(sourceUrl);
  return (
    <>
      {text && (
        <div className="col-span-2 min-w-0">
          <Detail label="Observation">{text}</Detail>
        </div>
      )}
      {href && (
        <div className="col-span-2 min-w-0">
          <Detail label="Source">
            <a href={href} target="_blank" rel="noopener noreferrer" className="break-all font-semibold underline">{href}</a>
          </Detail>
        </div>
      )}
    </>
  );
}
