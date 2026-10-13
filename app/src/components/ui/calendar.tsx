import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// Colors are hardcoded to this app's palette (leaf/ink/line) rather than the
// shadcn --primary/--accent/--popover variables, which this project never
// defines - using them here would silently render with no background at all.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const navBtnCls = "size-7 flex items-center justify-center rounded-md border border-(--ad-line) bg-(--ad-surface) text-(--ad-ink-soft) p-0 opacity-70 hover:opacity-100 hover:bg-(--ad-surface-2) transition-colors";
  const dayBtnCls = "size-8 p-0 font-normal rounded-md text-(--ad-ink) hover:bg-(--ad-fill) aria-selected:opacity-100";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-[13.5px] font-bold text-(--ad-ink)",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 px-1",
        button_previous: navBtnCls,
        button_next: navBtnCls,
        month_grid: "w-full border-collapse space-x-1",
        weekdays: "flex",
        weekday: "text-(--ad-ink-faint) rounded-md w-8 font-semibold text-[11px] uppercase",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-[13px] focus-within:relative focus-within:z-20",
        day_button: dayBtnCls,
        range_end: "day-range-end",
        selected: "bg-(--ad-green) text-white hover:bg-(--ad-green-hover) focus:bg-(--ad-green)",
        today: "bg-(--ad-green-tint) text-(--ad-green) font-bold",
        outside: "day-outside text-(--ad-ink-ghost) aria-selected:text-(--ad-ink-ghost)",
        disabled: "text-(--ad-ink-ghost) opacity-50",
        range_middle: "aria-selected:bg-(--ad-green-tint) aria-selected:text-(--ad-green)",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
