import { AlertCircle, Check, Circle, Clock, Minus, Phone, RefreshCw, Reply, Send, Zap, type LucideIcon } from 'lucide-react';

/* Status pills per the brand manual: every status is a word plus an icon, and
   the states differ by fill or outline so they read without colour. Solid
   purple is reserved for hot leads; solid ink is for something to fix. */
export type StatusIconName =
  | 'zap' | 'check' | 'clock' | 'send' | 'reply' | 'phone' | 'refresh' | 'minus' | 'alert' | 'circle';

const ICONS: Record<StatusIconName, LucideIcon> = {
  zap: Zap, check: Check, clock: Clock, send: Send, reply: Reply, phone: Phone,
  refresh: RefreshCw, minus: Minus, alert: AlertCircle, circle: Circle,
};

export interface StatusPillStyle {
  bg: string;
  text: string;
  border?: string;
  icon?: StatusIconName;
}

export function StatusPill({
  pill, children, className = '',
}: { pill: StatusPillStyle; children: React.ReactNode; className?: string }) {
  const Icon = pill.icon ? ICONS[pill.icon] : null;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${className}`}
      style={{ background: pill.bg, color: pill.text, border: pill.border ?? 'none' }}
    >
      {Icon && <Icon size={12} strokeWidth={2} aria-hidden />}
      {children}
    </span>
  );
}

/* Shared looks. Ink and purple only. */
export const PILL = {
  hot:     { bg: 'var(--ad-green, #7412ef)', text: 'var(--ad-surface, #ffffff)' },                                         // the only solid purple
  waiting: { bg: 'var(--ad-green-tint, #f1e9ff)', text: 'var(--ad-green, #7412ef)' },                                    // needs you
  sent:    { bg: 'var(--ad-surface, #ffffff)', text: 'var(--ad-ink, #0e0822)', border: '1px solid var(--ad-ink, #0e0822)' },  // delivered, no reply yet
  ahead:   { bg: 'var(--ad-surface, #ffffff)', text: 'var(--ad-ink, #0e0822)', border: '1px dashed var(--ad-ink-soft, #605978)' }, // scheduled, still ahead
  closed:  { bg: 'transparent', text: 'var(--ad-ink-soft, #605978)' },                                                   // closed, costs nothing
  problem: { bg: 'var(--ad-black, #0e0822)', text: 'var(--ad-surface, #ffffff)' },                                        // something to fix
} as const;
