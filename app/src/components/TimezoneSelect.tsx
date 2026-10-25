import type { CSSProperties } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { timezoneLabel, timezoneOptionsFor } from '../lib/timezones';

interface TimezoneSelectProps {
  value: string;
  onValueChange: (timeZone: string) => void;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}

// Dropdown of curated IANA zones; value is the IANA name, label is
// "City (UTC+hh:mm)" with the offset computed now so DST is right.
export function TimezoneSelect({
  value, onValueChange, triggerClassName, triggerStyle, contentClassName, contentStyle,
}: TimezoneSelectProps) {
  const now = new Date();
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClassName} style={triggerStyle} aria-label="Send timezone">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={contentClassName} style={contentStyle}>
        {timezoneOptionsFor(value).map((t) => (
          <SelectItem key={t.id} value={t.id}>{timezoneLabel(t.id, now)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
