import type { Allocation, Person, Project } from "@/lib/types";
import { capacityForWeek } from "@/lib/holidays";

export interface WeekRollup {
  weekStart: string;
  committed: number;
  pipeline: number;
  capacity: number;
  utilization: number | null;
}

export function practiceWeeklyRollup(
  members: Person[],
  allocations: Allocation[],
  projects: Project[],
  weeks: string[],
): WeekRollup[] {
  const memberIds = new Set(members.map((p) => p.personId));
  const status = new Map(projects.map((p) => [p.projectId, p.status]));
  const byWeek = new Map<string, { committed: number; pipeline: number }>(
    weeks.map((w) => [w, { committed: 0, pipeline: 0 }]),
  );
  for (const a of allocations) {
    if (!memberIds.has(a.personId)) continue;
    const bucket = byWeek.get(a.weekStart);
    if (!bucket) continue;
    if (status.get(a.projectId) === "pipeline") bucket.pipeline += a.hours;
    else bucket.committed += a.hours;
  }
  return weeks.map((weekStart) => {
    const { committed, pipeline } = byWeek.get(weekStart)!;
    const capacity = members.reduce((s, p) => s + capacityForWeek(weekStart, p.weeklyCapacityHours || 40), 0);
    const utilization = capacity > 0 ? Math.round(((committed + pipeline) / capacity) * 100) : null;
    return { weekStart, committed, pipeline, capacity, utilization };
  });
}

export function overallUtilization(rollups: WeekRollup[]): number | null {
  let booked = 0;
  let capacity = 0;
  for (const r of rollups) {
    booked += r.committed + r.pipeline;
    capacity += r.capacity;
  }
  return capacity > 0 ? Math.round((booked / capacity) * 100) : null;
}

export type UtilizationBand = "ok" | "watch" | "low";

export function utilizationBand(utilization: number, target: number): UtilizationBand {
  if (utilization >= target) return "ok";
  if (utilization >= target - 10) return "watch";
  return "low";
}
