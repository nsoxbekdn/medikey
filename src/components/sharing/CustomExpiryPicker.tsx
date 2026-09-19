"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  set,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Brand-themed replacement for the native <input type="datetime-local">
// picker, which renders with the OS's own (unthemed) calendar/time UI.
export function CustomExpiryPicker({
  value,
  onChange,
}: {
  value: string; // ISO string, or "" when nothing picked yet
  onChange: (isoString: string) => void;
}) {
  const selected = useMemo(() => (value ? new Date(value) : null), [value]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));
  const [hour, setHour] = useState(selected ? selected.getHours() : 12);
  const [minute, setMinute] = useState(selected ? selected.getMinutes() : 0);

  const today = startOfDay(new Date());
  const gridStart = startOfWeek(startOfMonth(viewMonth));
  const gridEnd = endOfWeek(endOfMonth(viewMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function commit(day: Date, h: number, m: number) {
    onChange(set(day, { hours: h, minutes: m, seconds: 0, milliseconds: 0 }).toISOString());
  }

  function selectDay(day: Date) {
    if (isBefore(day, today)) return;
    commit(day, hour, minute);
  }

  function updateTime(nextHour: number, nextMinute: number) {
    setHour(nextHour);
    setMinute(nextMinute);
    if (selected) commit(selected, nextHour, nextMinute);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 font-normal"
          />
        }
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        {selected ? format(selected, "d MMM yyyy, HH:mm") : "Pick a date & time"}
      </PopoverTrigger>
      <PopoverContent className="w-[300px]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{format(viewMonth, "MMMM yyyy")}</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const disabled = isBefore(day, today);
            const isSelected = selected && isSameDay(day, selected);
            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => selectDay(day)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
                  !isSameMonth(day, viewMonth) && "text-muted-foreground-soft",
                  isToday(day) && !isSelected && "ring-1 ring-inset ring-blue",
                  isSelected && "bg-blue text-white",
                  !isSelected && !disabled && "hover:bg-blue-soft",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Time</span>
          <Input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => updateTime(Number(e.target.value) || 0, minute)}
            className="h-8 w-16 text-center"
            aria-label="Hour"
          />
          <span className="text-muted-foreground">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => updateTime(hour, Number(e.target.value) || 0)}
            className="h-8 w-16 text-center"
            aria-label="Minute"
          />
          <Button type="button" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
