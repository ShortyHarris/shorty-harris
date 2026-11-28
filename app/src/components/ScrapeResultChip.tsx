import { Info } from 'lucide-react';
import { scrapeChipLabel, scrapeSummaryLabel, type ScrapeFields } from '../lib/campaignScrape';

// Compact chip shown in the admin and client campaign tables and cards - tappable when there's
// a full breakdown behind it, so the one-line summary never has to be truncated to fit a
// narrow column; the detail lives in a breakdown window instead.
export function ScrapeResultChip({ campaign, onOpenDetail }: { campaign: ScrapeFields; onOpenDetail: () => void }) {
  const sr = scrapeSummaryLabel(campaign);
  const hasDetail = campaign.scrape_status === 'complete' && !!campaign.last_scrape_summary;
  const toneCls = sr.tone === 'positive' ? 'bg-(--ad-green-tint) text-(--ad-green)' : 'bg-(--ad-fill) text-(--ad-ink-soft)';
  if (!hasDetail) {
    return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${toneCls}`}>{scrapeChipLabel(campaign)}</span>;
  }
  return (
    <button
      // Rows/cards open the campaign on click - don't let this bubble up
      // and stack that window under the scrape breakdown.
      onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
      title="View full scrape breakdown"
      className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border-0 px-2 py-0.5 text-[11.5px] font-semibold transition-opacity hover:opacity-75 ${toneCls}`}
    >
      {scrapeChipLabel(campaign)}
      <Info size={11} strokeWidth={2.5} className="opacity-60" />
    </button>
  );
}
