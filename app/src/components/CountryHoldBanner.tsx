import { TriangleAlert } from 'lucide-react';

export const COUNTRY_HOLD_MESSAGE = 'Sending is on hold for this country until the legal basis is confirmed.';

// Same amber warning treatment as the launch/campaign limit banners.
export function CountryHoldBanner({ reason, context }: { reason: string; context?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#e8d5a8] bg-[#f8efdb] px-4 py-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0dfb8]">
        <TriangleAlert size={15} strokeWidth={2.2} className="text-[#8a6417]" />
      </span>
      <p className="m-0 pt-0.5 text-[13px] leading-snug text-[#8a6417]">
        <strong className="font-bold">{COUNTRY_HOLD_MESSAGE}</strong>
        {reason && <> {reason}</>}
        {context && <span className="mt-1 block text-[12px] opacity-80">{context}</span>}
      </p>
    </div>
  );
}

export function EuBadge() {
  return (
    <span
      title="EU country - EU outreach rules apply"
      className="inline-flex shrink-0 items-center rounded-full bg-[#e7f0f7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em] text-[#2f6690]"
    >
      EU
    </span>
  );
}
