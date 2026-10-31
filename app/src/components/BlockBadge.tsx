import { blockInfo, type BlockTone } from '../lib/blockReasons';

const BLOCK_TONE_STYLE: Record<BlockTone, { bg: string; fg: string }> = {
  blocked:   { bg: '#f9f6ff', fg: '#0e0822' },
  paused:    { bg: '#f1e9ff', fg: '#5b0fc2' },
  scheduled: { bg: '#f9f6ff', fg: '#605978' },
};

/** Why an approved draft isn't going out. campaignStatus splits "campaign inactive" into not launched / paused / cancelled. */
export function BlockBadge({ reason, campaignStatus, className = '' }: {
  reason: string | null | undefined; campaignStatus?: string | null; className?: string;
}) {
  if (!reason) return null;
  const info = blockInfo(reason, campaignStatus);
  const style = BLOCK_TONE_STYLE[info.tone];
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        style={{ background: style.bg, color: style.fg }}
        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.04em]"
      >
        {info.badge}
      </span>
      {info.text !== info.badge && <span className="text-[11px] leading-snug" style={{ color: style.fg }}>{info.text}</span>}
    </div>
  );
}
