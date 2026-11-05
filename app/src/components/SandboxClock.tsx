import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { clockAheadLabel, inSendingHours, sandboxTimeParts } from '../hooks/useSandbox';

// The sandbox clock: an analog face whose hands sweep forward when time is advanced,
// the digital time and date, and a 24-hour strip with the 9-5 sending hours marked.

const two = (n: number) => String(n).padStart(2, '0');

function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SandboxClock({
  minutesAdvanced, timeZone, realRules,
}: {
  minutesAdvanced: number;
  timeZone: string;
  realRules: boolean;
}) {
  const now = useNow();
  const reduceMotion = useReducedMotion();
  const t = sandboxTimeParts(minutesAdvanced, timeZone, now);
  const open = inSendingHours(t);

  // Hand angles from the sandbox's local minutes since 1970, so they only ever grow:
  // advancing time sweeps the hands forward (a day is two turns of the hour hand).
  const sandboxMs = now.getTime() + minutesAdvanced * 60000;
  const utcMinuteOfDay = Math.floor(sandboxMs / 60000) % 1440;
  const tzShift = (((t.hour * 60 + t.minute) - utcMinuteOfDay) % 1440 + 1440) % 1440;
  const localMinutes = (Math.floor(sandboxMs / 60000) + tzShift) % (1440 * 360);
  const angles = { m: localMinutes * 6, h: localMinutes * 0.5 };

  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 60, damping: 14 };
  const dayPos = ((t.hour * 60 + t.minute) / 1440) * 100;

  return (
    <div className="flex min-w-0 items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-[92px] w-[92px] shrink-0" role="img"
        aria-label={`Sandbox clock showing ${two(t.hour)}:${two(t.minute)}`}>
        <circle cx="50" cy="50" r="46" fill="var(--ad-surface-2)" stroke="var(--ad-line-mid)" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1={i % 3 === 0 ? 8 : 10} x2="50" y2="15"
            stroke={i % 3 === 0 ? 'var(--ad-ink)' : 'var(--ad-ink-ghost)'}
            strokeWidth={i % 3 === 0 ? 2.6 : 1.4} strokeLinecap="round"
            transform={`rotate(${i * 30} 50 50)`} />
        ))}
        {/* Each hand sits in a group the size of the face, so it turns about the centre. */}
        <motion.g initial={false} animate={{ rotate: angles.h }} transition={transition}>
          <rect x="0" y="0" width="100" height="100" fill="none" />
          <line x1="50" y1="54" x2="50" y2="27" stroke="var(--ad-ink)" strokeWidth="4.2" strokeLinecap="round" />
        </motion.g>
        <motion.g initial={false} animate={{ rotate: angles.m }} transition={transition}>
          <rect x="0" y="0" width="100" height="100" fill="none" />
          <line x1="50" y1="56" x2="50" y2="14" stroke="var(--ad-green)" strokeWidth="2.6" strokeLinecap="round" />
        </motion.g>
        <circle cx="50" cy="50" r="3.6" fill="var(--ad-green)" />
      </svg>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[32px] leading-none font-extrabold tracking-tight text-(--ad-ink) tabular-nums">
            {two(t.hour)}:{two(t.minute)}
          </span>
          <span className="text-[14px] font-semibold text-(--ad-ink)">{t.weekday} {t.day} {t.month}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-(--ad-ink-soft)">
          <span>{minutesAdvanced === 0 ? 'Same as real time' : clockAheadLabel(minutesAdvanced)}</span>
          {realRules ? (
            <span className={`rounded-full px-2 py-0.5 font-semibold ${open
              ? 'bg-(--ad-green-tint) text-(--ad-green)'
              : 'bg-(--ad-clay-tint) text-(--ad-clay)'}`}>
              {open ? 'Sending hours' : t.isWeekday ? 'Outside sending hours' : 'Weekend: no sending'}
            </span>
          ) : (
            <span className="rounded-full bg-(--ad-surface-2) px-2 py-0.5 font-semibold">Fast mode: any hour</span>
          )}
        </div>

        {/* 24-hour strip: the 9-5 band is when real rules let emails go. */}
        <div className="mt-2.5" aria-hidden>
          <div className="relative h-2 rounded-full bg-(--ad-surface-2)">
            {realRules && t.isWeekday && (
              <div className="absolute inset-y-0 rounded-full bg-(--ad-green) opacity-35"
                style={{ left: `${(9 / 24) * 100}%`, width: `${(8 / 24) * 100}%` }} />
            )}
            <motion.div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-(--ad-surface) bg-(--ad-ink) shadow"
              initial={false} animate={{ left: `${dayPos}%` }} transition={transition} />
          </div>
          <div className="relative mt-1 h-3.5 text-[10.5px] text-(--ad-ink-ghost) tabular-nums">
            {[0, 6, 9, 12, 17, 24].map((h) => (
              <span key={h} className={`absolute ${h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${(h / 24) * 100}%` }}>{two(h)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
