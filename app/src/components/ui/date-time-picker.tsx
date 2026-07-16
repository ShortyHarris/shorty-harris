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
              ? "border-[#3c7a5b] bg-[#edf4ef] font-semibold text-[#3c7a5b]"
              : "border-[#ece8df] bg-white text-[#9a9d92] hover:border-[#ddd8cb]",
            className
          )}
        >
          {value ? <CalendarCheck size={13} className="shrink-0" /> : <CalendarIcon size={13} className="shrink-0 text-[#9a9d92]" />}
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
        <div className="flex items-center gap-2 border-t border-[#ece8df] px-3 py-2.5">
          <Clock size={13} className="shrink-0 text-[#9a9d92]" />
          <input
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            className="w-full rounded-md border border-[#ece8df] bg-[#fbf9f5] px-2 py-1.5 text-[12.5px] text-[#20211c] outline-none focus:border-[#3c7a5b]"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
