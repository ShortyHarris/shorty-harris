import { RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '../lib/formatRelativeTime';

// On phones the "Updated …" stamp and the label drop away and the button
// collapses to an icon, so it fits beside the page title without squeezing it.
export function RefreshButton({
  onRefresh,
  isFetching,
  dataUpdatedAt,
  className,
  label = 'Refresh',
}: {
  onRefresh: () => void;
  isFetching: boolean;
  dataUpdatedAt?: number;
  className: string;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {!!dataUpdatedAt && (
        <span className="whitespace-nowrap text-[11px] text-(--ad-ink-faint) max-md:hidden">
          {isFetching ? 'Updating…' : `Updated ${formatRelativeTime(dataUpdatedAt)}`}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={isFetching}
        aria-label={label}
        title={dataUpdatedAt ? `Updated ${formatRelativeTime(dataUpdatedAt)}` : undefined}
        className={`inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60 ${className} max-md:px-2.5`}
      >
        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        <span className="max-md:hidden">{label}</span>
      </button>
    </span>
  );
}
