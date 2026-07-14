/**
 * US federal holidays and holiday-adjusted weekly capacity. Mirrors the API's
 * HolidayHelper: a weekday observed holiday removes 8 hours from that week.
 * Week starts are Monday "yyyy-MM-dd" strings (UTC).
 */

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Sat -> Fri, Sun -> Mon. */
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(d.getTime() - 86400000);
  if (dow === 0) return new Date(d.getTime() + 86400000);
  return d;
}

/** nth <dow> of a month (dow: 0=Sun..6=Sat). */
function nthWeekday(year: number, month: number, dow: number, n: number): Date {
  const first = utc(year, month, 1);
  const offset = (dow - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + offset + 7 * (n - 1));
}

function lastWeekday(year: number, month: number, dow: number): Date {
  const last = utc(year, month + 1, 0);
  const offset = (last.getUTCDay() - dow + 7) % 7;
  return new Date(last.getTime() - offset * 86400000);
}

const cache = new Map<number, string[]>();

/** Observed US federal holiday dates ("yyyy-MM-dd") for a calendar year. */
export function federalHolidays(year: number): string[] {
  let dates = cache.get(year);
  if (!dates) {
    dates = [
      observed(utc(year, 1, 1)), // New Year's Day
      nthWeekday(year, 1, 1, 3), // MLK Day
      nthWeekday(year, 2, 1, 3), // Presidents' Day
      lastWeekday(year, 5, 1), // Memorial Day
      observed(utc(year, 6, 19)), // Juneteenth
      observed(utc(year, 7, 4)), // Independence Day
      nthWeekday(year, 9, 1, 1), // Labor Day
      nthWeekday(year, 10, 1, 2), // Columbus Day
      observed(utc(year, 11, 11)), // Veterans Day
      nthWeekday(year, 11, 4, 4), // Thanksgiving
      observed(utc(year, 12, 25)), // Christmas Day
    ].map(iso);
    cache.set(year, dates);
  }
  return dates;
}

/** Number of observed federal holidays falling Mon-Fri of the given week. */
export function holidaysInWeek(weekStart: string): number {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const friday = iso(new Date(start.getTime() + 4 * 86400000));
  const years =
    weekStart.slice(0, 4) === friday.slice(0, 4)
      ? [start.getUTCFullYear()]
      : [start.getUTCFullYear(), start.getUTCFullYear() + 1];
  return years
    .flatMap(federalHolidays)
    .filter((h) => h >= weekStart && h <= friday).length;
}

/** Weekly capacity reduced by 8h per federal holiday, floored at 0. */
export function capacityForWeek(weekStart: string, weeklyCapacityHours: number): number {
  return Math.max(0, weeklyCapacityHours - 8 * holidaysInWeek(weekStart));
}
