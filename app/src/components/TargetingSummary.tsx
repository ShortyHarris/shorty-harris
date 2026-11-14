import { MapPin, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { areaDisplayLabel, areaShortLabel, radiusMiles, type TargetArea } from '../lib/targetAreas';

const PREVIEW_COUNT = 2;

/* One fixed-height summary of what a campaign targets, for table rows and
   cards: the first couple of search terms and locations plus a "+N" count.
   However many terms or areas a campaign has, the row stays the same height;
   the full grouped list opens in a popover. */
export function TargetingSummary({ terms, areas }: { terms: string[]; areas: TargetArea[] }) {
  const locs = areas.map((a) => {
    const miles = radiusMiles(a);
    return miles === null ? areaShortLabel(a) : `${areaShortLabel(a)} (${miles} mi)`;
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Rows and cards open Edit campaign on click.
          onClick={(e) => e.stopPropagation()}
          aria-label="Show search terms and locations"
          className="flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-md border-0 bg-transparent p-0 text-left text-[11.5px] text-(--ad-ink-soft) hover:text-(--ad-ink)"
        >
          <SummaryLine icon={<Search size={11} strokeWidth={2.5} />} items={terms} empty="No search terms" />
          <SummaryLine icon={<MapPin size={11} strokeWidth={2.5} />} items={locs} empty="No locations" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-32px)] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[360px] overflow-y-auto px-4 py-3.5">
          <Section title="Search terms" count={terms.length}>
            {terms.length === 0 ? <EmptyNote>None yet</EmptyNote> : (
              <div className="flex flex-wrap gap-1">
                {terms.map((t, i) => (
                  <span key={`${t}-${i}`} className="rounded-full bg-(--ad-green-tint) px-2 py-0.5 text-[11.5px] font-semibold text-(--ad-green)">{t}</span>
                ))}
              </div>
            )}
          </Section>
          <div className="mt-3.5 border-t border-(--ad-fill) pt-3">
            <Section title="Locations" count={areas.length}>
              {areas.length === 0 ? <EmptyNote>None yet</EmptyNote> : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {areas.map((a, i) => {
                    const miles = radiusMiles(a);
                    return (
                      <li key={`${a.label}-${i}`} className="flex min-w-0 items-center gap-1.5 text-[12px] text-(--ad-ink)">
                        <MapPin size={12} className="shrink-0 text-(--ad-green)" />
                        <span className="min-w-0 flex-1 truncate" title={areaDisplayLabel(a)}>{a.label}</span>
                        {miles !== null && (
                          <span className="shrink-0 rounded-full bg-(--ad-fill) px-1.5 py-0.5 text-[10.5px] font-semibold text-(--ad-ink-soft)">{miles} mi</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SummaryLine({ icon, items, empty }: { icon: React.ReactNode; items: string[]; empty: string }) {
  const shown = items.slice(0, PREVIEW_COUNT);
  const more = items.length - shown.length;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-(--ad-ink-ghost)">{icon}</span>
      {items.length === 0 ? (
        <span className="italic text-(--ad-ink-ghost)">{empty}</span>
      ) : (
        <>
          <span className="min-w-0 truncate">{shown.join(', ')}</span>
          {more > 0 && (
            <span className="shrink-0 rounded-full bg-(--ad-fill) px-1.5 text-[10.5px] font-semibold leading-[16px] text-(--ad-ink-soft)">+{more}</span>
          )}
        </>
      )}
    </span>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="m-0 mb-2 text-[10.5px] font-semibold uppercase tracking-[.07em] text-(--ad-ink-faint)">
        {title} <span className="text-(--ad-ink-ghost)">· {count}</span>
      </p>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[12px] italic text-(--ad-ink-ghost)">{children}</p>;
}
