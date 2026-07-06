import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { mondayOf } from "@/lib/weeks";
import type { Project } from "@/lib/types";
import { utilizationStatus, rygTextClass } from "@/lib/ryg";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const WEEKS_PER_YEAR = 52;

export default function ResourceSummaryPage() {
  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", firstMonday, WEEKS_PER_YEAR],
    queryFn: () => api.listAllocations(firstMonday, WEEKS_PER_YEAR),
  });
  const actualsQuery = useQuery({ queryKey: ["actuals", year], queryFn: () => api.listActuals(year) });

  const projects = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projectsQuery.data ?? []) m.set(p.projectId, p);
    return m;
  }, [projectsQuery.data]);

  const rows = useMemo(() => {
    const totals = new Map<string, { committed: number; pipeline: number; weightedPipeline: number }>();
    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!totals.has(a.personId)) totals.set(a.personId, { committed: 0, pipeline: 0, weightedPipeline: 0 });
      const t = totals.get(a.personId)!;
      if (project.status === "pipeline") {
        t.pipeline += a.hours;
        t.weightedPipeline += a.hours * ((project.winProbability ?? 100) / 100);
      } else {
        t.committed += a.hours;
      }
    }

    const actualsByPerson = new Map<string, number>();
    for (const a of actualsQuery.data ?? []) {
      actualsByPerson.set(a.personId, (actualsByPerson.get(a.personId) ?? 0) + a.chargeableHours);
    }

    return (peopleQuery.data ?? []).map((person) => {
      const t = totals.get(person.personId) ?? { committed: 0, pipeline: 0, weightedPipeline: 0 };
      const baseHours = (person.weeklyCapacityHours || 40) * WEEKS_PER_YEAR;
      const target = person.utilizationTarget;
      const billableTarget = target != null ? Math.round((baseHours * target) / 100) : null;
      const totalChargeable = t.committed + t.pipeline;
      const forecastUtil = baseHours > 0 ? (totalChargeable / baseHours) * 100 : 0;
      const vsTarget = target != null ? forecastUtil - target : null;
      const remaining = billableTarget != null ? billableTarget - totalChargeable : null;
      const status = utilizationStatus(forecastUtil, target ?? null);
      const actualToDate = actualsByPerson.get(person.personId) ?? 0;
      return { person, ...t, baseHours, target, billableTarget, totalChargeable, forecastUtil, vsTarget, remaining, status, actualToDate };
    });
  }, [peopleQuery.data, allocationsQuery.data, actualsQuery.data, projects]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resource Summary</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {year} forecast: committed + pipeline hours vs. each person's utilization target.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annual rollup</CardTitle>
          <CardDescription>
            Base hours = weekly capacity × {WEEKS_PER_YEAR} weeks. Billable target = base × utilization target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Util target</TableHead>
                  <TableHead className="text-right">Billable target (hrs)</TableHead>
                  <TableHead className="text-right">Committed (hrs)</TableHead>
                  <TableHead className="text-right">Pipeline (hrs)</TableHead>
                  <TableHead className="text-right">Weighted pipeline (hrs)</TableHead>
                  <TableHead className="text-right">Actual to date (hrs)</TableHead>
                  <TableHead className="text-right">Total chargeable (hrs)</TableHead>
                  <TableHead className="text-right">Forecast util</TableHead>
                  <TableHead className="text-right">vs. target</TableHead>
                  <TableHead className="text-right">Remaining (hrs)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.person.personId}>
                    <TableCell className="font-medium">
                      <Link to={`/people/${r.person.personId}`} className="hover:underline">
                        {r.person.displayName}
                      </Link>
                    </TableCell>
                    <TableCell>{r.person.rank ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.target != null ? `${r.target}%` : "—"}</TableCell>
                    <TableCell className="text-right">{r.billableTarget ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.committed}</TableCell>
                    <TableCell className="text-right">{r.pipeline}</TableCell>
                    <TableCell className="text-right">{Math.round(r.weightedPipeline)}</TableCell>
                    <TableCell className="text-right">{r.actualToDate > 0 ? r.actualToDate : "—"}</TableCell>
                    <TableCell className="text-right">{r.totalChargeable}</TableCell>
                    <TableCell className={cn("text-right font-medium", r.status && rygTextClass[r.status])}>
                      {r.forecastUtil.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {r.vsTarget != null ? `${r.vsTarget >= 0 ? "+" : ""}${r.vsTarget.toFixed(1)} pts` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.remaining != null ? Math.max(0, r.remaining) : "—"}</TableCell>
                    <TableCell>
                      {r.status == null ? (
                        <Badge variant="secondary">No target</Badge>
                      ) : r.status === "ok" ? (
                        <Badge variant="ok">On track</Badge>
                      ) : r.status === "warn" ? (
                        <Badge variant="warn">At risk</Badge>
                      ) : (
                        <Badge variant="over">Off track</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-[var(--color-muted-foreground)]">
                      No people to display.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
