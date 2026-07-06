import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { currentWeekStart, weekRange, weekLabel } from "@/lib/weeks";
import type { Project } from "@/lib/types";
import { availabilityStatus, rygCellClass } from "@/lib/ryg";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function BenchPage() {
  const [weeks, setWeeks] = useState(4);
  const [minFree, setMinFree] = useState(8);
  const [practice, setPractice] = useState("all");
  const weekStart = currentWeekStart();
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

  const rows = useMemo(() => {
    // booked[personId][weekStart] -> hours (committed + pipeline)
    const booked = new Map<string, Map<string, number>>();
    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!booked.has(a.personId)) booked.set(a.personId, new Map());
      const byWeek = booked.get(a.personId)!;
      byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.hours);
    }

    let people = peopleQuery.data ?? [];
    if (practice !== "all") people = people.filter((p) => p.practice === practice);

    return people
      .map((person) => {
        const capacity = person.weeklyCapacityHours || 40;
        const freeByWeek = visibleWeeks.map((w) => capacity - (booked.get(person.personId)?.get(w) ?? 0));
        const totalFree = freeByWeek.reduce((s, f) => s + Math.max(0, f), 0);
        return { person, freeByWeek, totalFree };
      })
      .filter((r) => r.totalFree >= minFree)
      .sort((a, b) => b.totalFree - a.totalFree);
  }, [peopleQuery.data, allocationsQuery.data, projects, visibleWeeks, practice, minFree]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bench &amp; Availability</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Who has free hours over the next {weeks} weeks. Green &gt;8h free, yellow 0–8h, red overbooked.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Practice</Label>
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
          </div>
          <div className="space-y-1.5">
            <Label>Weeks ahead</Label>
            <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 4, 8, 12].map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minFree">Min free hrs</Label>
            <Input
              id="minFree"
              type="number"
              min={0}
              className="w-24"
              value={minFree}
              onChange={(e) => setMinFree(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length} {rows.length === 1 ? "person" : "people"} with ≥{minFree}h free
          </CardTitle>
          <CardDescription>Free = weekly capacity − committed − pipeline hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Bench availability grid">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--color-card)] p-2 text-left font-medium">Person</th>
                  <th className="p-2 text-left font-medium">Rank</th>
                  <th className="p-2 text-left font-medium">Practice</th>
                  {visibleWeeks.map((w) => (
                    <th key={w} className="min-w-16 p-2 text-center font-medium text-[var(--color-muted-foreground)]">
                      {weekLabel(w)}
                    </th>
                  ))}
                  <th className="p-2 text-right font-medium">Total free</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.person.personId} className="border-t">
                    <td className="sticky left-0 z-10 bg-[var(--color-card)] p-2 font-medium">
                      <Link to={`/people/${r.person.personId}`} className="hover:underline">
                        {r.person.displayName}
                      </Link>
                    </td>
                    <td className="p-2">{r.person.rank ?? "—"}</td>
                    <td className="p-2">{r.person.practice ?? "—"}</td>
                    {r.freeByWeek.map((free, i) => (
                      <td
                        key={visibleWeeks[i]}
                        className={cn("p-2 text-center tabular-nums", rygCellClass[availabilityStatus(free)])}
                      >
                        {free}
                      </td>
                    ))}
                    <td className="p-2 text-right font-medium tabular-nums">{r.totalFree}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4 + visibleWeeks.length} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      Nobody matches the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
