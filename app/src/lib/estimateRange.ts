// Estimates are shown as ranges that never claim more precision than they have:
// "40–80", "Up to 200" when the low end is zero or the range hits the campaign's cap,
// "About 50" when both ends agree, and "Fewer than 1" instead of "0–0".

export function estimateRange(lo: number | null | undefined, hi: number | null | undefined, cap?: number | null): string {
  if (lo == null || hi == null || !Number.isFinite(lo) || !Number.isFinite(hi)) return '…';
  const a = Math.max(0, Math.round(Math.min(lo, hi)));
  const b = Math.max(0, Math.round(Math.max(lo, hi)));
  if (b === 0) return 'Fewer than 1';
  // Capped at the campaign's maximum: the true number could be higher, but we stop there.
  if (cap != null && cap > 0 && b >= cap) return a >= cap ? `Up to ${cap}` : `${a}–${cap} (max)`;
  if (a === 0) return `Up to ${b}`;
  if (a === b) return `About ${a}`;
  return `${a}–${b}`;
}
