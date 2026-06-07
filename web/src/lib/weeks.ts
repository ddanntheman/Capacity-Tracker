import { addWeeks, format, parseISO, startOfWeek } from "date-fns";

/** ISO date (yyyy-MM-dd) of the Monday of the week containing `date`. */
export function mondayOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function currentWeekStart(): string {
  return mondayOf(new Date());
}

/** Returns `count` consecutive Monday ISO dates starting at `startIso`. */
export function weekRange(startIso: string, count: number): string[] {
  const start = parseISO(startIso);
  return Array.from({ length: count }, (_, i) => format(addWeeks(start, i), "yyyy-MM-dd"));
}

export function shiftWeeks(startIso: string, delta: number): string {
  return format(addWeeks(parseISO(startIso), delta), "yyyy-MM-dd");
}

/** Short label like "Jun 9" for column headers. */
export function weekLabel(iso: string): string {
  return format(parseISO(iso), "MMM d");
}
