import { useCallback, type CSSProperties } from 'react';
import { SearchableSelect, type SearchableGroup, type SearchableOption } from './SearchableSelect';
import {
  allTimezones, isKnownTimezone, isSameTimezone, timezoneLabel,
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

function toOption(zone: string): SearchableOption {
  return { value: zone, label: timezoneLabel(zone), hint: zone.split('/')[0], search: zone };
}

// Searchable dropdown of every IANA zone the browser knows. Value is the IANA
// name; labels read "Prague (UTC+02:00)" with the offset computed now so DST
// is right.
export function TimezoneSelect({ value, onValueChange, suggested = [], ...style }: TimezoneSelectProps) {
  const suggestedKey = suggested.join('|');
  const getGroups = useCallback((): SearchableGroup[] => {
    const suggestedList = suggestedKey ? suggestedKey.split('|') : [];
    const suggestedSet = new Set(suggestedList);
    const groups: SearchableGroup[] = [];
    // A saved zone outside the browser's list stays selectable so saving never rewrites it.
    if (value && !isKnownTimezone(value) && !suggestedSet.has(value)) {
      groups.push({ heading: 'Current setting', options: [toOption(value)] });
    }
    groups.push({ heading: 'Suggested', options: suggestedList.map(toOption) });
    groups.push({
      heading: 'All timezones',
      options: allTimezones().filter((z) => !suggestedSet.has(z)).map(toOption),
    });
    return groups;
  }, [suggestedKey, value]);

  return (
    <SearchableSelect
      value={value}
      onValueChange={onValueChange}
      getGroups={getGroups}
      triggerLabel={timezoneLabel(value)}
      ariaLabel="Send timezone"
      searchPlaceholder="Search city or zone, e.g. Prag"
      emptyText="No matching timezone."
      isSame={isSameTimezone}
      {...style}
    />
  );
}
