import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateFilterPreset =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "pick_week"
  | "this_month"
  | "pick_month"
  | "between"
  | "all";

export type DateRange = { from: string | null; to: string | null; preset: DateFilterPreset };

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function presetToRange(preset: DateFilterPreset, custom?: { from?: string; to?: string; week?: Date; month?: string }): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today": return { from: ymd(today), to: ymd(today), preset };
    case "yesterday": {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      return { from: ymd(d), to: ymd(d), preset };
    }
    case "tomorrow": {
      const d = new Date(today); d.setDate(d.getDate() + 1);
      return { from: ymd(d), to: ymd(d), preset };
    }
    case "this_week": {
      const start = new Date(today); start.setDate(start.getDate() - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return { from: ymd(start), to: ymd(end), preset };
    }
    case "pick_week": {
      const ref = custom?.week ?? today;
      const start = new Date(ref); start.setDate(start.getDate() - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return { from: ymd(start), to: ymd(end), preset };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: ymd(start), to: ymd(end), preset };
    }
    case "pick_month": {
      const m = custom?.month ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const [y, mo] = m.split("-").map(Number);
      const start = new Date(y, mo - 1, 1);
      const end = new Date(y, mo, 0);
      return { from: ymd(start), to: ymd(end), preset };
    }
    case "between":
      return { from: custom?.from ?? ymd(today), to: custom?.to ?? ymd(today), preset };
    case "all":
    default:
      return { from: null, to: null, preset };
  }
}

export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  className?: string;
}) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [weekDate, setWeekDate] = useState<Date | undefined>(new Date());

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select value={value.preset} onValueChange={(p) => onChange(presetToRange(p as DateFilterPreset, { from, to, week: weekDate, month }))}>
        <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="tomorrow">Tomorrow</SelectItem>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="pick_week">Pick Week</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="pick_month">Pick Month</SelectItem>
          <SelectItem value="between">Between Dates</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>

      {value.preset === "pick_week" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              {weekDate ? weekDate.toLocaleDateString() : "Pick a week"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={weekDate} onSelect={(d) => {
              if (d) { setWeekDate(d); onChange(presetToRange("pick_week", { week: d })); }
            }} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      )}

      {value.preset === "pick_month" && (
        <Input
          type="month"
          value={month}
          onChange={(e) => { setMonth(e.target.value); onChange(presetToRange("pick_month", { month: e.target.value })); }}
          className="h-9 w-44"
        />
      )}

      {value.preset === "between" && (
        <>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); onChange(presetToRange("between", { from: e.target.value, to })); }} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); onChange(presetToRange("between", { from, to: e.target.value })); }} className="h-9 w-40" />
        </>
      )}
    </div>
  );
}
