import { RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '../lib/formatRelativeTime';

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
        <span className="whitespace-nowrap text-[11px] text-[#9a9d92]">
          {isFetching ? 'Updating…' : `Updated ${formatRelativeTime(dataUpdatedAt)}`}
        </span>
      )}
      <button
        onClick={onRefresh}
        disabled={isFetching}
        className={`inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        {label}
      </button>
    </span>
  );
}
