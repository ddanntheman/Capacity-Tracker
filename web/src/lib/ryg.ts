export type Ryg = "ok" | "warn" | "over";

/** Forecast utilization vs. target: green at/above target, yellow within 10 pts below, red beyond. */
export function utilizationStatus(forecastPct: number, targetPct: number | null): Ryg | null {
  if (targetPct == null) return null;
  if (forecastPct >= targetPct) return "ok";
  if (forecastPct >= targetPct - 10) return "warn";
  return "over";
}

/** Weekly availability: green with >8h free, yellow at 0–8h free, red when overbooked. */
export function availabilityStatus(freeHours: number): Ryg {
  if (freeHours < 0) return "over";
  if (freeHours <= 8) return "warn";
  return "ok";
}

export const rygCellClass: Record<Ryg, string> = {
  ok: "bg-[var(--color-ok)]/15",
  warn: "bg-[var(--color-warn)]/25",
  over: "bg-[var(--color-over)]/20",
};

export const rygBarClass: Record<Ryg, string> = {
  ok: "bg-[var(--color-ok)]",
  warn: "bg-[var(--color-warn)]",
  over: "bg-[var(--color-over)]",
};

export const rygTextClass: Record<Ryg, string> = {
  ok: "text-[var(--color-ok)]",
  warn: "text-[var(--color-warn)]",
  over: "text-[var(--color-over)]",
};
