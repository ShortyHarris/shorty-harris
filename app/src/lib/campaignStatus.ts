// A campaign that has found prospects but was never launched is still "draft" in
// the database; "Draft" alone reads as if nothing ran, so say what state it is in.
export function campaignStatusLabel(status: string, prospectCount: number, fallback: Record<string, string>): string {
  if (status === 'draft' && prospectCount > 0) return 'Ready to launch';
  return fallback[status] ?? status;
}
