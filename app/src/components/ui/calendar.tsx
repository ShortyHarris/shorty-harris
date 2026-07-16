import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// Colors are hardcoded to this app's palette (leaf/ink/line) rather than the
// shadcn --primary/--accent/--popover variables, which this project never
// defines — using them here would silently render with no background at all.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const navBtnCls = "size-7 flex items-center justify-center rounded-md border border-[#ece8df] bg-white text-[#62655c] p-0 opacity-70 hover:opacity-100 hover:bg-[#fbf9f5] transition-colors";
  const dayBtnCls = "size-8 p-0 font-normal rounded-md text-[#20211c] hover:bg-[#f5f2ec] aria-selected:opacity-100";

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-[13.5px] font-bold text-[#20211c]",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 px-1",
        button_previous: navBtnCls,
        button_next: navBtnCls,
        month_grid: "w-full border-collapse space-x-1",
        weekdays: "flex",
        weekday: "text-[#9a9d92] rounded-md w-8 font-semibold text-[11px] uppercase",
        week: "flex w-full mt-2",
        day: "relative p-0 text-center text-[13px] focus-within:relative focus-within:z-20",
        day_button: dayBtnCls,
        range_end: "day-range-end",
        selected: "bg-[#3c7a5b] text-white hover:bg-[#2d5e46] focus:bg-[#3c7a5b]",
        today: "bg-[#edf4ef] text-[#3c7a5b] font-bold",
        outside: "day-outside text-[#c4bfb5] aria-selected:text-[#c4bfb5]",
        disabled: "text-[#c4bfb5] opacity-50",
        range_middle: "aria-selected:bg-[#edf4ef] aria-selected:text-[#3c7a5b]",
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
