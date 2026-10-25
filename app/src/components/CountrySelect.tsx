import { useCallback, type CSSProperties } from 'react';
import { SearchableSelect, type SearchableGroup } from './SearchableSelect';
import { allCountryOptions, anyCountryName } from '../lib/countries';

interface CountrySelectProps {
  // ISO-2 code, or '' for none.
  value: string;
  onValueChange: (code: string) => void;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

// Searchable dropdown of every country. Value is the ISO-2 code.
export function CountrySelect({ value, onValueChange, ...style }: CountrySelectProps) {
  const getGroups = useCallback((): SearchableGroup[] => {
    const all = allCountryOptions();
    const groups: SearchableGroup[] = [];
    // A saved code outside the list stays selectable so saving never rewrites it.
    if (value && !all.some((c) => c.code === value)) {
      groups.push({ heading: 'Current setting', options: [{ value, label: value, hint: value }] });
    }
    groups.push({
      heading: 'All countries',
      options: all.map((c) => ({ value: c.code, label: c.name, hint: c.code })),
    });
    return groups;
  }, [value]);

  return (
    <SearchableSelect
      value={value}
      onValueChange={onValueChange}
      getGroups={getGroups}
      triggerLabel={anyCountryName(value)}
      placeholder="Select a country"
      ariaLabel="Country"
      searchPlaceholder="Search country, e.g. Czech"
      emptyText="No matching country."
      {...style}
    />
  );
}
