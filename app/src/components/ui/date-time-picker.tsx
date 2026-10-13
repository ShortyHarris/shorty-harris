import * as React from "react"
import { CalendarIcon, CalendarCheck, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function DateTimePicker({
  value,
  onChange,
  minDate,
  placeholder = "Pick a date & time",
  className,
}: {
  value: Date | null
  onChange: (date: Date | null) => void
  minDate?: Date
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [timeValue, setTimeValue] = React.useState(value ? formatTime(value) : "09:00")

  function handleDateSelect(date: Date | undefined) {
    if (!date) {
      onChange(null)
      return
    }
    const [h, m] = timeValue.split(":").map(Number)
    const next = new Date(date)
    next.setHours(h, m, 0, 0)
    onChange(next)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const t = e.target.value
    setTimeValue(t)
    if (!value || !t) return
    const [h, m] = t.split(":").map(Number)
    const next = new Date(value)
    next.setHours(h, m, 0, 0)
    onChange(next)
  }

  const display = value
    ? value.toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
      })
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] outline-none transition-colors",
            value
              ? "border-(--ad-green) bg-(--ad-green-tint) font-semibold text-(--ad-green)"
              : "border-(--ad-line) bg-(--ad-surface) text-(--ad-ink-faint) hover:border-(--ad-line-strong)",
            className
          )}
        >
          {value ? <CalendarCheck size={13} className="shrink-0" /> : <CalendarIcon size={13} className="shrink-0 text-(--ad-ink-faint)" />}
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={handleDateSelect}
          disabled={minDate ? { before: minDate } : undefined}
          autoFocus
        />
        <div className="flex items-center gap-2 border-t border-(--ad-line) px-3 py-2.5">
          <Clock size={13} className="shrink-0 text-(--ad-ink-faint)" />
          <input
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            className="w-full rounded-md border border-(--ad-line) bg-(--ad-surface-2) px-2 py-1.5 text-[12.5px] text-(--ad-ink) outline-none focus:border-(--ad-green)"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
