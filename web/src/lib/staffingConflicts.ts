import type { Allocation, Person } from "@/lib/types";
import { capacityForWeek } from "@/lib/holidays";

export interface WeekConflict {
  weekStart: string;
  booked: number;
  capacity: number;
}

export interface PersonConflicts {
  personId: string;
  displayName: string;
  weeks: WeekConflict[];
}

/**
 * Weeks where a person's total booked hours (across every project, committed
 * and pipeline) exceed their holiday-adjusted weekly capacity.
 */
export function staffingConflicts(
  personIds: string[],
  people: Person[],
  allocations: Allocation[],
): PersonConflicts[] {
  const byId = new Map(people.map((p) => [p.personId, p]));
  const booked = new Map<string, Map<string, number>>();
  const ids = new Set(personIds);

  for (const a of allocations) {
    if (!ids.has(a.personId)) continue;
    const perWeek = booked.get(a.personId) ?? new Map<string, number>();
    perWeek.set(a.weekStart, (perWeek.get(a.weekStart) ?? 0) + a.hours);
    booked.set(a.personId, perWeek);
  }

  const conflicts: PersonConflicts[] = [];
  for (const personId of ids) {
    const person = byId.get(personId);
    if (!person) continue;
    const perWeek = booked.get(personId);
    if (!perWeek) continue;

    const weeks: WeekConflict[] = [];
    for (const [weekStart, hours] of perWeek) {
      const capacity = capacityForWeek(weekStart, person.weeklyCapacityHours || 40);
      if (hours > capacity) {
        weeks.push({ weekStart, booked: hours, capacity });
      }
    }

    if (weeks.length > 0) {
      weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      conflicts.push({ personId, displayName: person.displayName, weeks });
    }
  }

  return conflicts.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
