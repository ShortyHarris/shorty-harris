import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  // Small muted text on the right (e.g. the region).
  hint?: string;
  // Extra text the search also matches (e.g. the full IANA name).
  search?: string;
}

export interface SearchableGroup {
  heading: string;
  options: SearchableOption[];
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  // Called when the list opens (and when it changes), so building a long list
  // costs nothing while the picker is closed. Memoise it with useCallback.
  getGroups: () => SearchableGroup[];
  // Text on the trigger button for the current value.
  triggerLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel: string;
  emptyText?: string;
  // Treat two different values as the same selection (e.g. zone aliases).
  isSame?: (a: string, b: string) => boolean;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

function matches(option: SearchableOption, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/_/g, ' ');
  if (!q) return true;
  return `${option.label} ${option.search ?? ''}`.toLowerCase().replace(/_/g, ' ').includes(q);
}

// Dropdown with a search box on top, styled like the app's other dropdowns.
// Keyboard: type to filter, Up/Down to move, Enter to choose, Esc to close.
export function SearchableSelect({
  value, onValueChange, getGroups, triggerLabel, placeholder = 'Select…', searchPlaceholder = 'Search…',
  ariaLabel, emptyText = 'No matches.', isSame = (a, b) => a === b,
  triggerClassName, triggerStyle, contentClassName, contentStyle,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // `start` is the group's first position in the flat list, which keyboard
  // navigation and hover use as the option index.
  const groups = useMemo<(SearchableGroup & { start: number })[]>(() => {
    if (!open) return [];
    let start = 0;
    return getGroups()
      .map((g) => ({ ...g, options: g.options.filter((o) => matches(o, query)) }))
      .filter((g) => g.options.length > 0)
      .map((g) => {
        const withStart = { ...g, start };
        start += g.options.length;
        return withStart;
      });
  }, [open, query, getGroups]);

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);

  function choose(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(0);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[active]) choose(flat[active].value);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus:outline-none',
            triggerClassName,
          )}
          style={triggerStyle}
        >
          <span className={cn('truncate', !triggerLabel && 'opacity-50')}>{triggerLabel || placeholder}</span>
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
            placeholder={searchPlaceholder}
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
            className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
            style={{ borderColor: 'inherit' }}
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {flat.length === 0 && (
            <p className="m-0 px-2 py-3 text-center text-[12.5px] opacity-60">{emptyText}</p>
          )}
          {groups.map((g) => (
            <div key={g.heading}>
              <div className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[.06em] opacity-60">{g.heading}</div>
              {g.options.map((o, n) => {
                const i = g.start + n;
                const selected = isSame(o.value, value);
                return (
                  <button
                    key={`${g.heading}-${o.value}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-index={i}
                    onClick={() => choose(o.value)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-inherit',
                      i === active && 'bg-black/5',
                    )}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[11px] opacity-50">{o.hint}</span>}
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
