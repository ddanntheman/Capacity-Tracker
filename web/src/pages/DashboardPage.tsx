import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { currentWeekStart, weekLabel } from "@/lib/weeks";
import { availabilityStatus, rygBarClass, type Ryg } from "@/lib/ryg";
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

type StatDrill = "utilization" | "allocated" | "people" | "overAllocated" | "fullyAvailable" | "partiallyAvailable";

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

  const maxWeek = useMemo(() => Math.max(100, ...(util.data?.byWeek.map((w) => w.utilizationRate) ?? [0])), [util.data]);

  // Per-person totals for the current week, used by stat-card drill-downs.
  const currentWeekRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of allocations.data ?? []) {
      if (a.weekStart !== weekStart) continue;
      totals.set(a.personId, (totals.get(a.personId) ?? 0) + a.hours);
    }
    return (people.data ?? [])
      .map((p) => ({ person: p, booked: totals.get(p.personId) ?? 0, capacity: p.weeklyCapacityHours || 40 }))
      .sort((a, b) => b.booked - a.booked);
  }, [allocations.data, people.data, weekStart]);

  const fullyAvailable = currentWeekRows.filter((r) => r.booked === 0);
  const partiallyAvailable = currentWeekRows.filter((r) => r.booked > 0 && r.booked < r.capacity);

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

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          loading={allocations.isLoading || people.isLoading}
          title="Fully available"
          value={`${fullyAvailable.length}`}
          description="On the bench this week — no booked hours"
          onClick={() => setStatDrill("fullyAvailable")}
        />
        <StatCard
          loading={allocations.isLoading || people.isLoading}
          title="Partially available"
          value={`${partiallyAvailable.length}`}
          description="Booked under capacity — free hours this week"
          onClick={() => setStatDrill("partiallyAvailable")}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forward utilization — next {weeks} weeks</CardTitle>
          <CardDescription>Team-wide utilization rate by week. Green ≥80%, yellow below, red over 100%. Click a bar for the weekly breakdown.</CardDescription>
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
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={cn("w-full rounded-t", rygBarClass[weekBarStatus(w.utilizationRate)])}
                    style={{ height: `${(w.utilizationRate / maxWeek) * 100}%`, minHeight: 2 }}
                    role="img"
                    aria-label={`Week of ${w.weekStart}: ${w.utilizationRate}% utilization`}
                  />
                </div>
                <span className="text-xs text-[var(--color-muted-foreground)]">{weekLabel(w.weekStart)}</span>
              </button>
            ))}
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
                {availabilityRows.map((r) => {
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
  fullyAvailable: { title: "Fully available people", description: "People with zero booked hours this week — ready to staff." },
  partiallyAvailable: { title: "Partially available people", description: "People booked below capacity this week — free hours to staff." },
};

function StatDrillDialog({
  kind,
  weekStart,
  rows,
  onClose,
}: {
  kind: StatDrill;
  weekStart: string;
  rows: { person: Person; booked: number; capacity: number }[];
  onClose: () => void;
}) {
  const { title, description } = statDrillTitles[kind];
  const visible =
    kind === "overAllocated"
      ? rows.filter((r) => r.booked !== r.capacity)
      : kind === "fullyAvailable"
        ? rows.filter((r) => r.booked === 0)
        : kind === "partiallyAvailable"
          ? rows.filter((r) => r.booked > 0 && r.booked < r.capacity)
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
