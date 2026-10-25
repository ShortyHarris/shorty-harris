import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';
import {
  allTimezones, isKnownTimezone, isSameTimezone, matchesTimezoneQuery, timezoneLabel,
} from '../lib/timezones';

interface TimezoneSelectProps {
  value: string;
  onValueChange: (timeZone: string) => void;
  // Zones to list first as "Suggested" (typically the client's country).
  suggested?: readonly string[];
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

interface Group {
  heading: string;
  zones: string[];
}

// Searchable dropdown of every IANA zone the browser knows. Value is the IANA
// name; labels read "Prague (UTC+02:00)" with the offset computed now so DST
// is right.
export function TimezoneSelect({
  value, onValueChange, suggested = [], triggerClassName, triggerStyle, contentClassName, contentStyle,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo<Group[]>(() => {
    if (!open) return [];
    const suggestedSet = new Set(suggested);
    const result: Group[] = [];
    // A saved zone outside the browser's list stays selectable so saving never rewrites it.
    if (value && !isKnownTimezone(value) && !suggestedSet.has(value)) {
      result.push({ heading: 'Current setting', zones: [value] });
    }
    result.push({ heading: 'Suggested', zones: [...suggested] });
    result.push({ heading: 'All timezones', zones: allTimezones().filter((z) => !suggestedSet.has(z)) });
    return result
      .map((g) => ({ ...g, zones: g.zones.filter((z) => matchesTimezoneQuery(z, query)) }))
      .filter((g) => g.zones.length > 0);
  }, [open, query, suggested, value]);

  const flat = useMemo(() => groups.flatMap((g) => g.zones), [groups]);

  function choose(zone: string) {
    onValueChange(zone);
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(0);
    }
  }

  function scrollActiveIntoView(index: number) {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length;
      setActive(next);
      scrollActiveIntoView(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[active]) choose(flat[active]);
    }
  }

  let index = -1;
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Send timezone"
          className={cn(
            'flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus:outline-none',
            triggerClassName,
          )}
          style={triggerStyle}
        >
          <span className="truncate">{timezoneLabel(value)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn('w-(--radix-popover-trigger-width) min-w-64 p-0', contentClassName)}
        style={contentStyle}
        onOpenAutoFocus={(e) => {
          // Focus the search box, not the popover container.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        <div className="border-b p-2" style={{ borderColor: 'inherit' }}>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search city or zone, e.g. Prag"
            aria-label="Search timezones"
            className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
            style={{ borderColor: 'inherit' }}
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {flat.length === 0 && (
            <p className="m-0 px-2 py-3 text-center text-[12.5px] opacity-60">No matching timezone.</p>
          )}
          {groups.map((g) => (
            <div key={g.heading}>
              <div className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[.06em] opacity-60">{g.heading}</div>
              {g.zones.map((zone) => {
                index += 1;
                const i = index;
                const selected = isSameTimezone(zone, value);
                return (
                  <button
                    key={`${g.heading}-${zone}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-index={i}
                    onClick={() => choose(zone)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-inherit',
                      i === active && 'bg-black/5',
                    )}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{timezoneLabel(zone)}</span>
                    <span className="shrink-0 text-[11px] opacity-50">{zone.split('/')[0]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
