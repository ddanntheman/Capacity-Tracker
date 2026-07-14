import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { currentWeekStart, weekLabel } from "@/lib/weeks";
import { availabilityStatus, rygBarClass, type Ryg } from "@/lib/ryg";
import { capacityForWeek } from "@/lib/holidays";
import type { Person, Project } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function weekBarStatus(utilizationRate: number): Ryg {
  if (utilizationRate > 100) return "over";
  if (utilizationRate >= 80) return "ok";
  return "warn";
}

type StatDrill =
  | "utilization"
  | "allocated"
  | "people"
  | "overAllocated"
  | "fullyAvailable"
  | "availableSoon"
  | "partiallyAvailable"
  | "overcommitted";

export default function DashboardPage() {
  const weekStart = currentWeekStart();
  const weeks = 6;
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);
  const [statDrill, setStatDrill] = useState<StatDrill | null>(null);
  const [weekDrill, setWeekDrill] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ["dashboard", "summary", weekStart], queryFn: () => api.dashboardSummary(weekStart) });
  const util = useQuery({ queryKey: ["dashboard", "util", weekStart, weeks], queryFn: () => api.dashboardUtilization(weekStart, weeks) });
  const people = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projects = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const allocations = useQuery({
    queryKey: ["allocations", weekStart, weeks],
    queryFn: () => api.listAllocations(weekStart, weeks),
  });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });

  const clientIdByName = useMemo(() => new Map((clients.data ?? []).map((c) => [c.name, c.clientId])), [clients.data]);
  const projectById = useMemo(() => new Map((projects.data ?? []).map((p) => [p.projectId, p])), [projects.data]);

  // Per-week committed vs pipeline split so the forward chart shows how much of
  // each week's utilization is signed work vs. unconverted pipeline.
  const weekSplit = useMemo(() => {
    const peopleIds = new Set((people.data ?? []).map((p) => p.personId));
    const byWeek = new Map<string, { committed: number; pipeline: number }>();
    for (const a of allocations.data ?? []) {
      if (!peopleIds.has(a.personId)) continue;
      const project = projectById.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!byWeek.has(a.weekStart)) byWeek.set(a.weekStart, { committed: 0, pipeline: 0 });
      const t = byWeek.get(a.weekStart)!;
      if (project.status === "pipeline") t.pipeline += a.hours;
      else t.committed += a.hours;
    }
    const m = new Map<string, { committedPct: number; pipelinePct: number }>();
    for (const [week, t] of byWeek) {
      const capacityPerWeek = (people.data ?? []).reduce((s, p) => s + capacityForWeek(week, p.weeklyCapacityHours || 40), 0);
      m.set(week, {
        committedPct: capacityPerWeek > 0 ? (t.committed / capacityPerWeek) * 100 : 0,
        pipelinePct: capacityPerWeek > 0 ? (t.pipeline / capacityPerWeek) * 100 : 0,
      });
    }
    return m;
  }, [allocations.data, people.data, projectById]);

  const maxWeek = useMemo(() => Math.max(100, ...(util.data?.byWeek.map((w) => w.utilizationRate) ?? [0])), [util.data]);

  // Per-person totals for the current week, used by stat-card drill-downs.
  const currentWeekRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of allocations.data ?? []) {
      if (a.weekStart !== weekStart) continue;
      totals.set(a.personId, (totals.get(a.personId) ?? 0) + a.hours);
    }
    return (people.data ?? [])
      .map((p) => ({ person: p, booked: totals.get(p.personId) ?? 0, capacity: capacityForWeek(weekStart, p.weeklyCapacityHours || 40) }))
      .sort((a, b) => b.booked - a.booked);
  }, [allocations.data, people.data, weekStart]);

  // Weekly booked totals per person across the fetched horizon, used to spot
  // people rolling off (a fully-free week) within the next 30 days.
  const bookedByPersonWeek = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const a of allocations.data ?? []) {
      if (!m.has(a.personId)) m.set(a.personId, new Map());
      const wm = m.get(a.personId)!;
      wm.set(a.weekStart, (wm.get(a.weekStart) ?? 0) + a.hours);
    }
    return m;
  }, [allocations.data]);

  const next30Weeks = useMemo(
    () =>
      (util.data?.byWeek ?? [])
        .map((w) => w.weekStart)
        .filter((w) => w > weekStart)
        .slice(0, 4),
    [util.data, weekStart],
  );

  const freeWeekWithin30 = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of currentWeekRows) {
      const wm = bookedByPersonWeek.get(r.person.personId);
      const free = next30Weeks.find((w) => (wm?.get(w) ?? 0) === 0);
      if (free) m.set(r.person.personId, free);
    }
    return m;
  }, [currentWeekRows, bookedByPersonWeek, next30Weeks]);

  const fullyAvailable = currentWeekRows.filter((r) => r.booked === 0);
  const availableSoon = currentWeekRows.filter((r) => r.booked > 0 && freeWeekWithin30.has(r.person.personId));
  const partiallyAvailable = currentWeekRows.filter((r) => r.booked > 0 && r.booked < r.capacity);
  const overcommitted = currentWeekRows.filter((r) => r.booked > r.capacity);

  // Pipeline engagements whose expected start date has passed without converting.
  const stalePipeline = useMemo(
    () =>
      (projects.data ?? [])
        .filter((p) => p.status === "pipeline" && p.startDate && p.startDate < weekStart)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [projects.data, weekStart],
  );

  const availabilityRows = useMemo(
    () => [...currentWeekRows].sort((a, b) => (b.capacity - b.booked) - (a.capacity - a.booked)),
    [currentWeekRows],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Leadership Dashboard</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Capacity for the week of {weekStart}. Click any card or bar to see how it's derived.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard loading={summary.isLoading} title="Utilization" value={`${summary.data?.utilizationRate ?? 0}%`} description="Allocated ÷ available" onClick={() => setStatDrill("utilization")} />
        <StatCard loading={summary.isLoading} title="Allocated hours" value={`${summary.data?.allocatedHours ?? 0}`} description={`of ${summary.data?.availableHours ?? 0} available`} onClick={() => setStatDrill("allocated")} />
        <StatCard loading={summary.isLoading} title="People" value={`${summary.data?.peopleCount ?? 0}`} description={`${summary.data?.fullyAllocated ?? 0} fully allocated`} onClick={() => setStatDrill("people")} />
        <StatCard loading={summary.isLoading} title="Over-allocated" value={`${summary.data?.overAllocated ?? 0}`} description={`${summary.data?.underutilized ?? 0} underutilized`} onClick={() => setStatDrill("overAllocated")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          loading={allocations.isLoading || people.isLoading}
          title="Available now"
          value={`${fullyAvailable.length}`}
          description="On the bench this week — no booked hours"
          onClick={() => setStatDrill("fullyAvailable")}
        />
        <StatCard
          loading={allocations.isLoading || people.isLoading || util.isLoading}
          title="Available in 30 days"
          value={`${availableSoon.length}`}
          description="Booked now but rolling off within 4 weeks"
          onClick={() => setStatDrill("availableSoon")}
        />
        <StatCard
          loading={allocations.isLoading || people.isLoading}
          title="Partially available"
          value={`${partiallyAvailable.length}`}
          description="Booked under capacity — free hours this week"
          onClick={() => setStatDrill("partiallyAvailable")}
        />
        <StatCard
          loading={allocations.isLoading || people.isLoading}
          title="Overcommitted"
          value={`${overcommitted.length}`}
          description="Booked over capacity this week"
          onClick={() => setStatDrill("overcommitted")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forward utilization — next {weeks} weeks</CardTitle>
          <CardDescription>
            Team-wide utilization rate by week, split into committed (solid) vs pipeline (hatched) hours. Click a bar
            for the weekly breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4 h-48">
            {util.data?.byWeek.map((w) => (
              <button
                type="button"
                key={w.weekStart}
                onClick={() => setWeekDrill(w.weekStart)}
                className="flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-2"
              >
                <span className="text-xs font-medium">{w.utilizationRate}%</span>
                <div className="flex w-full flex-1 flex-col items-stretch justify-end">
                  {(() => {
                    const split = weekSplit.get(w.weekStart) ?? { committedPct: w.utilizationRate, pipelinePct: 0 };
                    const barClass = rygBarClass[weekBarStatus(w.utilizationRate)];
                    return (
                      <div
                        className="flex w-full flex-col justify-end"
                        style={{ height: "100%" }}
                        role="img"
                        aria-label={`Week of ${w.weekStart}: ${w.utilizationRate}% utilization (${split.committedPct.toFixed(0)}% committed, ${split.pipelinePct.toFixed(0)}% pipeline)`}
                      >
                        {split.pipelinePct > 0 && (
                          <div
                            className={cn("w-full rounded-t opacity-40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.6)_3px,rgba(255,255,255,0.6)_6px)]", barClass)}
                            style={{ height: `${(split.pipelinePct / maxWeek) * 100}%`, minHeight: 2 }}
                          />
                        )}
                        <div
                          className={cn("w-full", split.pipelinePct <= 0 && "rounded-t", barClass)}
                          style={{ height: `${(split.committedPct / maxWeek) * 100}%`, minHeight: 2 }}
                        />
                      </div>
                    );
                  })()}
                </div>
                <span className="text-xs text-[var(--color-muted-foreground)]">{weekLabel(w.weekStart)}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-[var(--color-ok)]" /> Committed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm bg-[var(--color-ok)] opacity-40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.6)_3px,rgba(255,255,255,0.6)_6px)]" />{" "}
              Pipeline
            </span>
          </div>
        </CardContent>
      </Card>

      {stalePipeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stale pipeline — needs a decision ({stalePipeline.length})</CardTitle>
            <CardDescription>
              Pipeline engagements whose expected start date has passed. Convert to active or close them so forecasts stay honest.{" "}
              <Link to="/projects?status=pipeline" className="underline">
                View all in Projects
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Expected start</TableHead>
                  <TableHead className="text-right">Weeks overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stalePipeline.slice(0, 5).map((p) => (
                  <TableRow key={p.projectId}>
                    <TableCell className="font-medium">
                      <Link to={`/projects/${p.projectId}`} className="hover:underline">
                        {p.clientName} — {p.projectName}
                      </Link>
                    </TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell className="text-right text-[var(--color-over)] font-medium">
                      {Math.max(1, Math.floor((new Date(`${weekStart}T00:00:00`).getTime() - new Date(`${p.startDate}T00:00:00`).getTime()) / (7 * 24 * 3600 * 1000)))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Allocation by project</CardTitle>
            <CardDescription>Total allocated hours across the window. Client names link to client pages.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Allocated hrs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {util.data?.byProject.map((p) => {
                  const project = projectById.get(p.projectId);
                  const clientId = project ? clientIdByName.get(project.clientName) : undefined;
                  return (
                    <TableRow key={p.projectId}>
                      <TableCell>
                        {clientId ? (
                          <Link to={`/clients/${clientId}`} className="hover:underline">
                            {p.projectName}
                          </Link>
                        ) : (
                          p.projectName
                        )}
                      </TableCell>
                      <TableCell className="text-right">{p.allocatedHours}h</TableCell>
                    </TableRow>
                  );
                })}
                {util.isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={2}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!util.isLoading && (util.data?.byProject.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-[var(--color-muted-foreground)]">
                      No allocations in range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>People — availability this week</CardTitle>
            <CardDescription>Sorted by free hours. Click a person to drill into their allocations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank · Practice</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Free</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allocations.isLoading || people.isLoading) &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!(allocations.isLoading || people.isLoading) && availabilityRows.map((r) => {
                  const free = r.capacity - r.booked;
                  const status = availabilityStatus(free);
                  return (
                    <TableRow key={r.person.personId} className="cursor-pointer" onClick={() => setDrill({ id: r.person.personId, name: r.person.displayName })}>
                      <TableCell className="font-medium">{r.person.displayName}</TableCell>
                      <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                        {[r.person.rank, r.person.practice].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.booked}h</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={status === "ok" ? "ok" : status === "warn" ? "warn" : "over"}>{free}h</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {drill && <DrillDownDialog id={drill.id} name={drill.name} weekStart={weekStart} weeks={weeks} onClose={() => setDrill(null)} />}
      {statDrill && (
        <StatDrillDialog
          kind={statDrill}
          weekStart={weekStart}
          rows={currentWeekRows}
          freeWeekWithin30={freeWeekWithin30}
          onClose={() => setStatDrill(null)}
        />
      )}
      {weekDrill && (
        <WeekDrillDialog
          weekStart={weekDrill}
          people={people.data ?? []}
          projects={projectById}
          allocations={(allocations.data ?? []).filter((a) => a.weekStart === weekDrill)}
          onClose={() => setWeekDrill(null)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, description, onClick, loading }: { title: string; value: string; description: string; onClick: () => void; loading?: boolean }) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-[var(--color-accent)]" onClick={onClick}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        {loading ? (
          <div className="h-9 w-16 animate-pulse rounded-md bg-[var(--color-accent)]" />
        ) : (
          <CardTitle className="text-3xl">{value}</CardTitle>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
      </CardContent>
    </Card>
  );
}

const statDrillTitles: Record<StatDrill, { title: string; description: string }> = {
  utilization: { title: "Utilization derivation", description: "Utilization = total booked hours ÷ total weekly capacity across active people." },
  allocated: { title: "Allocated hours derivation", description: "Sum of every person's booked hours for the current week." },
  people: { title: "People breakdown", description: "Active people and how fully each is booked this week." },
  overAllocated: { title: "Over/under allocation", description: "People booked over capacity (red) or with free hours (yellow/green)." },
  fullyAvailable: { title: "Available now", description: "People with zero booked hours this week — ready to staff." },
  availableSoon: { title: "Available in next 30 days", description: "People booked now with a fully-free week coming up within 4 weeks." },
  partiallyAvailable: { title: "Partially available people", description: "People booked below capacity this week — free hours to staff." },
  overcommitted: { title: "Overcommitted people", description: "People booked over their weekly capacity — rebalance their staffing." },
};

function StatDrillDialog({
  kind,
  weekStart,
  rows,
  freeWeekWithin30,
  onClose,
}: {
  kind: StatDrill;
  weekStart: string;
  rows: { person: Person; booked: number; capacity: number }[];
  freeWeekWithin30: Map<string, string>;
  onClose: () => void;
}) {
  const { title, description } = statDrillTitles[kind];
  const visible =
    kind === "overAllocated"
      ? rows.filter((r) => r.booked !== r.capacity)
      : kind === "fullyAvailable"
        ? rows.filter((r) => r.booked === 0)
        : kind === "availableSoon"
          ? rows.filter((r) => r.booked > 0 && freeWeekWithin30.has(r.person.personId))
          : kind === "partiallyAvailable"
            ? rows.filter((r) => r.booked > 0 && r.booked < r.capacity)
            : kind === "overcommitted"
              ? rows.filter((r) => r.booked > r.capacity)
              : rows;
  const totalBooked = rows.reduce((s, r) => s + r.booked, 0);
  const totalCapacity = rows.reduce((s, r) => s + r.capacity, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Week of {weekStart}. {description}
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Booked</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead className="text-right">Free</TableHead>
              {kind === "availableSoon" && <TableHead>Free from</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const free = r.capacity - r.booked;
              const status = availabilityStatus(free);
              return (
                <TableRow key={r.person.personId}>
                  <TableCell className="font-medium">
                    <Link to={`/people/${r.person.personId}`} className="hover:underline">
                      {r.person.displayName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{r.booked}h</TableCell>
                  <TableCell className="text-right">{r.capacity}h</TableCell>
                  <TableCell className="text-right">{free}h</TableCell>
                  {kind === "availableSoon" && (
                    <TableCell>{weekLabel(freeWeekWithin30.get(r.person.personId) ?? "")}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant={status === "ok" ? "ok" : status === "warn" ? "warn" : "over"}>
                      {status === "over" ? "Overbooked" : status === "warn" ? "Near capacity" : "Available"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="border-t pt-3 text-sm">
          Total: {totalBooked}h booked of {totalCapacity}h capacity ={" "}
          {totalCapacity > 0 ? ((totalBooked / totalCapacity) * 100).toFixed(1) : 0}% utilization.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function WeekDrillDialog({
  weekStart,
  people,
  projects,
  allocations,
  onClose,
}: {
  weekStart: string;
  people: Person[];
  projects: Map<string, Project>;
  allocations: { personId: string; projectId: string; hours: number }[];
  onClose: () => void;
}) {
  const rows = useMemo(() => {
    const byPerson = new Map<string, { total: number; details: string[] }>();
    for (const a of allocations) {
      if (!byPerson.has(a.personId)) byPerson.set(a.personId, { total: 0, details: [] });
      const r = byPerson.get(a.personId)!;
      r.total += a.hours;
      const p = projects.get(a.projectId);
      if (p && a.hours > 0) r.details.push(`${p.clientName} — ${p.projectName} (${a.hours}h)`);
    }
    return people
      .map((p) => ({ person: p, ...(byPerson.get(p.personId) ?? { total: 0, details: [] }) }))
      .sort((a, b) => b.total - a.total);
  }, [allocations, people, projects]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Week of {weekStart}</DialogTitle>
          <DialogDescription>Per-person booked hours contributing to this week's utilization.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Projects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.person.personId}>
                <TableCell className="font-medium">{r.person.displayName}</TableCell>
                <TableCell className="text-right">{r.total}h</TableCell>
                <TableCell className="text-xs text-[var(--color-muted-foreground)]">{r.details.join("; ") || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function DrillDownDialog({ id, name, weekStart, weeks, onClose }: { id: string; name: string; weekStart: string; weeks: number; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["dashboard", "person", id, weekStart, weeks],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/person/${id}?weekStart=${weekStart}&weeks=${weeks}`);
      return (await res.json()) as { allocations: { allocationId: string; projectName: string; weekStart: string; hours: number }[] };
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name} — allocations</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.allocations.map((a) => (
              <TableRow key={a.allocationId}>
                <TableCell>{weekLabel(a.weekStart)}</TableCell>
                <TableCell>{a.projectName}</TableCell>
                <TableCell className="text-right">{a.hours}h</TableCell>
              </TableRow>
            ))}
            {(data?.allocations.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[var(--color-muted-foreground)]">
                  No allocations in range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
