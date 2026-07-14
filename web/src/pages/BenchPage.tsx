import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { currentWeekStart, weekRange, weekLabel } from "@/lib/weeks";
import type { Project } from "@/lib/types";
import { availabilityStatus, rygCellClass } from "@/lib/ryg";
import { capacityForWeek } from "@/lib/holidays";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function BenchPage() {
  // Filters live in the URL so they survive navigation and can be shared.
  const [searchParams, setSearchParams] = useSearchParams();
  const weeks = Number(searchParams.get("weeks")) || 4;
  const minFree = searchParams.has("minFree") ? Math.max(0, Number(searchParams.get("minFree")) || 0) : 8;
  const practice = searchParams.get("practice") ?? "all";
  const skill = searchParams.get("skill") ?? "all";
  const availability = searchParams.get("availability") ?? "all";
  const setParam = (key: string, value: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
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

  const skills = useMemo(() => {
    const set = new Set<string>();
    for (const p of peopleQuery.data ?? []) {
      for (const s of (p.skills ?? "").split(",")) {
        const t = s.trim();
        if (t) set.add(t);
      }
    }
    return [...set].sort();
  }, [peopleQuery.data]);

  const rows = useMemo(() => {
    // booked[personId][weekStart] -> hours (committed + pipeline)
    const booked = new Map<string, Map<string, number>>();
    const assignments = new Map<string, Map<string, { project: Project; firstWeek: string; lastWeek: string }>>();
    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed" || a.hours <= 0) continue;
      if (!booked.has(a.personId)) booked.set(a.personId, new Map());
      const byWeek = booked.get(a.personId)!;
      byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.hours);
      if (!assignments.has(a.personId)) assignments.set(a.personId, new Map());
      const byProject = assignments.get(a.personId)!;
      const entry = byProject.get(a.projectId);
      if (!entry) byProject.set(a.projectId, { project, firstWeek: a.weekStart, lastWeek: a.weekStart });
      else {
        if (a.weekStart < entry.firstWeek) entry.firstWeek = a.weekStart;
        if (a.weekStart > entry.lastWeek) entry.lastWeek = a.weekStart;
      }
    }

    let people = peopleQuery.data ?? [];
    if (practice !== "all") people = people.filter((p) => p.practice === practice);
    if (skill !== "all") {
      people = people.filter((p) =>
        (p.skills ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .includes(skill.toLowerCase()),
      );
    }

    return people
      .map((person) => {
        const baseCapacity = person.weeklyCapacityHours || 40;
        const capacityByWeek = visibleWeeks.map((w) => capacityForWeek(w, baseCapacity));
        const freeByWeek = visibleWeeks.map((w, i) => capacityByWeek[i] - (booked.get(person.personId)?.get(w) ?? 0));
        const totalFree = freeByWeek.reduce((s, f) => s + Math.max(0, f), 0);
        const fullyAvailable = freeByWeek.every((f, i) => f >= capacityByWeek[i]);
        const overcommitted = freeByWeek.some((f) => f < 0);
        const bookedNow = freeByWeek[0] < capacityByWeek[0];
        const rollOffIndex = bookedNow ? freeByWeek.findIndex((f, i) => f >= capacityByWeek[i]) : -1;
        const rollOffWeek = rollOffIndex > 0 ? visibleWeeks[rollOffIndex] : null;
        const availableSoon = bookedNow && rollOffIndex > 0 && rollOffIndex <= 4;
        const personAssignments = [...(assignments.get(person.personId)?.values() ?? [])].sort((a, b) =>
          a.firstWeek.localeCompare(b.firstWeek),
        );
        return {
          person,
          freeByWeek,
          totalFree,
          fullyAvailable,
          overcommitted,
          availableSoon,
          rollOffWeek,
          assignments: personAssignments,
        };
      })
      .filter((r) => availability === "over" || r.totalFree >= minFree)
      .filter((r) => {
        switch (availability) {
          case "full":
            return r.fullyAvailable;
          case "soon":
            return r.availableSoon;
          case "partial":
            return !r.fullyAvailable && r.totalFree > 0;
          case "over":
            return r.overcommitted;
          default:
            return true;
        }
      })
      .sort((a, b) => b.totalFree - a.totalFree);
  }, [peopleQuery.data, allocationsQuery.data, projects, visibleWeeks, practice, minFree, skill, availability]);

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
            <Select value={practice} onValueChange={(v) => setParam("practice", v)}>
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
            <Label>Skill</Label>
            <Select value={skill} onValueChange={(v) => setParam("skill", v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All skills</SelectItem>
                {skills.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Availability</Label>
            <Select value={availability} onValueChange={(v) => setParam("availability", v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="full">Available now</SelectItem>
                <SelectItem value="soon">Available in 30 days</SelectItem>
                <SelectItem value="partial">Partially available</SelectItem>
                <SelectItem value="over">Overcommitted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Weeks ahead</Label>
            <Select value={String(weeks)} onValueChange={(v) => setParam("weeks", v)}>
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
              onChange={(e) => setParam("minFree", String(Math.max(0, Number(e.target.value) || 0)))}
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
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Bench availability grid">
              <thead className="sticky top-0 z-20 bg-[var(--color-card)]">
                <tr>
                  <th className="sticky left-0 z-30 bg-[var(--color-card)] p-2 text-left font-medium">Person</th>
                  <th className="p-2 text-left font-medium">Rank</th>
                  <th className="p-2 text-left font-medium">Practice</th>
                  <th className="p-2 text-left font-medium">Availability</th>
                  <th className="p-2 text-left font-medium">Rolls off</th>
                  <th className="p-2 text-left font-medium">Assignments</th>
                  {visibleWeeks.map((w) => (
                    <th key={w} className="min-w-16 p-2 text-center font-medium text-[var(--color-muted-foreground)]">
                      {weekLabel(w)}
                    </th>
                  ))}
                  <th className="p-2 text-right font-medium">Total free</th>
                  <th className="p-2" />
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
                    <td className="p-2">
                      {r.overcommitted ? (
                        <span className="text-[var(--color-over)]">Overcommitted</span>
                      ) : r.fullyAvailable ? (
                        <span className="text-[var(--color-ok)]">Available now</span>
                      ) : r.availableSoon ? (
                        <span className="text-[var(--color-warn)]">Available soon</span>
                      ) : (
                        "Partial"
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.rollOffWeek ? weekLabel(r.rollOffWeek) : "—"}</td>
                    <td className="max-w-52 p-2">
                      {r.assignments.length === 0 ? (
                        <span className="text-[var(--color-muted-foreground)]">—</span>
                      ) : (
                        <span className="line-clamp-2" title={r.assignments.map((a) => `${a.project.clientName} — ${a.project.projectName} (${weekLabel(a.firstWeek)}–${weekLabel(a.lastWeek)})`).join("; ")}>
                          {r.assignments
                            .map((a) => `${a.project.projectName} (thru ${weekLabel(a.lastWeek)})`)
                            .join("; ")}
                        </span>
                      )}
                    </td>
                    {r.freeByWeek.map((free, i) => (
                      <td
                        key={visibleWeeks[i]}
                        className={cn("p-2 text-center tabular-nums", rygCellClass[availabilityStatus(free)])}
                      >
                        {free}
                      </td>
                    ))}
                    <td className="p-2 text-right font-medium tabular-nums">{r.totalFree}</td>
                    <td className="p-2 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/utilization?person=${r.person.personId}`}>Staff</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8 + visibleWeeks.length} className="p-6 text-center text-[var(--color-muted-foreground)]">
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
