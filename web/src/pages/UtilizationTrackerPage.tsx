import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { currentWeekStart, mondayOf, shiftWeeks, weekLabel, weekRange } from "@/lib/weeks";
import type { Person, Project } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { availabilityStatus, rygCellClass } from "@/lib/ryg";
import { cn } from "@/lib/utils";

type WeekBucket = { committed: number; pipeline: number; committedProjects: string[]; pipelineProjects: string[] };

export default function UtilizationTrackerPage() {
  const { me, hasRole } = useAuth();
  const viewerOnly = !hasRole("editor") && !hasRole("leadership");
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [weeks, setWeeks] = useState(12);
  const [practice, setPractice] = useState("all");
  const visibleWeeks = useMemo(() => weekRange(weekStart, weeks), [weekStart, weeks]);

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", weekStart, weeks],
    queryFn: () => api.listAllocations(weekStart, weeks),
  });

  const projects = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projectsQuery.data ?? []) m.set(p.projectId, p);
    return m;
  }, [projectsQuery.data]);

  const practices = useMemo(() => {
    const set = new Set<string>();
    for (const p of peopleQuery.data ?? []) if (p.practice) set.add(p.practice);
    return [...set].sort();
  }, [peopleQuery.data]);

  const people = useMemo(() => {
    let all = peopleQuery.data ?? [];
    if (viewerOnly) all = all.filter((p) => p.personId === me?.oid);
    return practice === "all" ? all : all.filter((p) => p.practice === practice);
  }, [peopleQuery.data, practice, viewerOnly, me?.oid]);

  // index[personId][weekStart] -> { committed, pipeline }
  const index = useMemo(() => {
    const map = new Map<string, Map<string, WeekBucket>>();
    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!map.has(a.personId)) map.set(a.personId, new Map());
      const byWeek = map.get(a.personId)!;
      if (!byWeek.has(a.weekStart)) {
        byWeek.set(a.weekStart, { committed: 0, pipeline: 0, committedProjects: [], pipelineProjects: [] });
      }
      const bucket = byWeek.get(a.weekStart)!;
      const label = `${project.clientName} — ${project.projectName}`;
      if (project.status === "pipeline") {
        bucket.pipeline += a.hours;
        if (a.hours > 0) bucket.pipelineProjects.push(label);
      } else {
        bucket.committed += a.hours;
        if (a.hours > 0) bucket.committedProjects.push(label);
      }
    }
    return map;
  }, [allocationsQuery.data, projects]);

  const startOfYear = mondayOf(new Date(new Date().getFullYear(), 0, 7));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Utilization Tracker</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Weekly committed, pipeline, and available hours per person.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={practice} onValueChange={setPractice}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All practices</SelectItem>
              {practices.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Previous weeks" onClick={() => setWeekStart(shiftWeeks(weekStart, -weeks))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(currentWeekStart())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfYear)}>
            Jan
          </Button>
          <Button variant="outline" size="icon" aria-label="Next weeks" onClick={() => setWeekStart(shiftWeeks(weekStart, weeks))}>
            <ChevronRight className="size-4" />
          </Button>
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[8, 12, 16, 26, 52].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Utilization tracker grid">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--color-card)] p-2 text-left font-medium">Person</th>
                  <th className="sticky left-40 z-10 bg-[var(--color-card)] p-2 text-left font-medium"> </th>
                  {visibleWeeks.map((w) => (
                    <th key={w} className="min-w-16 p-2 text-center font-medium text-[var(--color-muted-foreground)]">
                      {weekLabel(w)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <PersonRows key={person.personId} person={person} weeks={visibleWeeks} byWeek={index.get(person.personId)} />
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={visibleWeeks.length + 2} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      No people to display.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1"><Badge variant="ok">C</Badge> committed (won/sold work)</span>
            <span className="flex items-center gap-1"><Badge variant="warn">P</Badge> pipeline (likely to close)</span>
            <span className="flex items-center gap-1"><Badge variant="secondary">A</Badge> available (capacity − C − P)</span>
            <span className="flex items-center gap-2">
              <span className={cn("inline-block size-3 rounded", rygCellClass.ok)} /> &gt;8h free
              <span className={cn("inline-block size-3 rounded", rygCellClass.warn)} /> 0–8h free
              <span className={cn("inline-block size-3 rounded", rygCellClass.over)} /> overbooked
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PersonRows({
  person,
  weeks,
  byWeek,
}: {
  person: Person;
  weeks: string[];
  byWeek: Map<string, WeekBucket> | undefined;
}) {
  const capacity = person.weeklyCapacityHours || 40;
  const rows: { key: "committed" | "pipeline" | "available"; label: string; variant: "ok" | "warn" | "secondary" }[] = [
    { key: "committed", label: "C", variant: "ok" },
    { key: "pipeline", label: "P", variant: "warn" },
    { key: "available", label: "A", variant: "secondary" },
  ];

  return (
    <>
      {rows.map((row, i) => (
        <tr key={row.key} className={cn(i === 0 && "border-t")}>
          {i === 0 ? (
            <td rowSpan={3} className="sticky left-0 z-10 bg-[var(--color-card)] p-2 align-top font-medium">
              <div>{person.displayName}</div>
              <div className="text-xs font-normal text-[var(--color-muted-foreground)]">
                {[person.rank, person.practice].filter(Boolean).join(" · ")}
              </div>
            </td>
          ) : null}
          <td className="sticky left-40 z-10 bg-[var(--color-card)] p-1">
            <Badge variant={row.variant}>{row.label}</Badge>
          </td>
          {weeks.map((w) => {
            const bucket = byWeek?.get(w);
            const committed = bucket?.committed ?? 0;
            const pipeline = bucket?.pipeline ?? 0;
            const value =
              row.key === "committed" ? committed : row.key === "pipeline" ? pipeline : Math.max(0, capacity - committed - pipeline);
            const title =
              row.key === "committed"
                ? bucket?.committedProjects.join(", ")
                : row.key === "pipeline"
                  ? bucket?.pipelineProjects.join(", ")
                  : undefined;
            const free = capacity - committed - pipeline;
            const overbooked = row.key === "available" && free < 0;
            return (
              <td
                key={w}
                title={title || undefined}
                className={cn(
                  "p-1 text-center tabular-nums",
                  value === 0 && row.key !== "available" && "text-[var(--color-muted-foreground)]",
                  row.key === "available" && rygCellClass[availabilityStatus(free)],
                  overbooked && "text-[var(--color-over)] font-medium",
                )}
              >
                {overbooked ? `-${committed + pipeline - capacity}` : value}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
