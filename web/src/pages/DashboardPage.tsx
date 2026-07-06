import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { currentWeekStart, weekLabel } from "@/lib/weeks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function DashboardPage() {
  const weekStart = currentWeekStart();
  const weeks = 6;
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  const summary = useQuery({ queryKey: ["dashboard", "summary", weekStart], queryFn: () => api.dashboardSummary(weekStart) });
  const util = useQuery({ queryKey: ["dashboard", "util", weekStart, weeks], queryFn: () => api.dashboardUtilization(weekStart, weeks) });
  const people = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });

  const maxWeek = useMemo(() => Math.max(100, ...(util.data?.byWeek.map((w) => w.utilizationRate) ?? [0])), [util.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Leadership Dashboard</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Capacity for the week of {weekStart}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Utilization" value={`${summary.data?.utilizationRate ?? 0}%`} description="Allocated ÷ available" />
        <StatCard title="Allocated hours" value={`${summary.data?.allocatedHours ?? 0}`} description={`of ${summary.data?.availableHours ?? 0} available`} />
        <StatCard title="People" value={`${summary.data?.peopleCount ?? 0}`} description={`${summary.data?.fullyAllocated ?? 0} fully allocated`} />
        <StatCard title="Over-allocated" value={`${summary.data?.overAllocated ?? 0}`} description={`${summary.data?.underutilized ?? 0} underutilized`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forward utilization — next {weeks} weeks</CardTitle>
          <CardDescription>Team-wide utilization rate by week.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4 h-48">
            {util.data?.byWeek.map((w) => (
              <div key={w.weekStart} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs font-medium">{w.utilizationRate}%</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-[var(--color-primary)]"
                    style={{ height: `${(w.utilizationRate / maxWeek) * 100}%`, minHeight: 2 }}
                    role="img"
                    aria-label={`Week of ${w.weekStart}: ${w.utilizationRate}% utilization`}
                  />
                </div>
                <span className="text-xs text-[var(--color-muted-foreground)]">{weekLabel(w.weekStart)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Allocation by project</CardTitle>
            <CardDescription>Total allocated hours across the window.</CardDescription>
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
                {util.data?.byProject.map((p) => (
                  <TableRow key={p.projectId}>
                    <TableCell>{p.projectName}</TableCell>
                    <TableCell className="text-right">{p.allocatedHours}h</TableCell>
                  </TableRow>
                ))}
                {(util.data?.byProject.length ?? 0) === 0 && (
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
            <CardTitle>People</CardTitle>
            <CardDescription>Click a person to drill into their allocations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.data?.map((p) => (
                  <TableRow key={p.personId} className="cursor-pointer" onClick={() => setDrill({ id: p.personId, name: p.displayName })}>
                    <TableCell className="font-medium">{p.displayName}</TableCell>
                    <TableCell>{p.jobTitle ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {drill && <DrillDownDialog id={drill.id} name={drill.name} weekStart={weekStart} weeks={weeks} onClose={() => setDrill(null)} />}
    </div>
  );
}

function StatCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
      </CardContent>
    </Card>
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
      <DialogContent>
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
