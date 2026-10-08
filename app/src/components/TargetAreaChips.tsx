import { MapPin } from 'lucide-react';
import { areaDisplayLabel, type TargetArea } from '../lib/targetAreas';

// Read-only chips for a campaign's target areas. Radius areas get a pin icon
// and their "Within N miles of ..." label; plain places look exactly as they
// always have. `radiusOnly` is for dense lists (tables, cards) where plain
// places stay unlisted as before and only the radius areas are surfaced.
export function TargetAreaChips({
  areas, radiusOnly = false, chipClassName = '', className = 'flex flex-wrap gap-1.5',
}: { areas: TargetArea[]; radiusOnly?: boolean; chipClassName?: string; className?: string }) {
  const shown = radiusOnly ? areas.filter((a) => a.mode === 'radius') : areas;
  if (shown.length === 0) return null;
  return (
    <div className={className}>
      {shown.map((a, i) => (
        <span
          key={`${a.label}-${i}`}
          title={areaDisplayLabel(a)}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border border-[#ece8df] bg-[#fbf9f5] px-2.5 py-1 text-[12px] text-[#62655c] ${chipClassName}`}
        >
          {a.mode === 'radius' && <MapPin size={11} className="shrink-0 text-[#3c7a5b]" />}
          <span className="truncate">{areaDisplayLabel(a)}</span>
        </span>
      ))}
    </div>
  );
}
