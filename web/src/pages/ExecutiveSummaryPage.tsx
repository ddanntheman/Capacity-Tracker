import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mondayOf } from "@/lib/weeks";
import type { Project } from "@/lib/types";
import { utilizationStatus, rygTextClass } from "@/lib/ryg";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const WEEKS_PER_YEAR = 52;

export default function ExecutiveSummaryPage() {
  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", firstMonday, WEEKS_PER_YEAR],
    queryFn: () => api.listAllocations(firstMonday, WEEKS_PER_YEAR),
  });

  const projects = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projectsQuery.data ?? []) m.set(p.projectId, p);
    return m;
  }, [projectsQuery.data]);

  const { practiceRows, firm } = useMemo(() => {
    const perPerson = new Map<string, { committed: number; pipeline: number }>();
    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!perPerson.has(a.personId)) perPerson.set(a.personId, { committed: 0, pipeline: 0 });
      const t = perPerson.get(a.personId)!;
      if (project.status === "pipeline") t.pipeline += a.hours;
      else t.committed += a.hours;
    }

    type Roll = {
      headcount: number;
      capacity: number;
      committed: number;
      pipeline: number;
      revenue: number;
      hasRates: boolean;
      targetSum: number;
      targetCount: number;
      onTrack: number;
      offTrack: number;
    };
    const empty = (): Roll => ({
      headcount: 0,
      capacity: 0,
      committed: 0,
      pipeline: 0,
      revenue: 0,
      hasRates: false,
      targetSum: 0,
      targetCount: 0,
      onTrack: 0,
      offTrack: 0,
    });
    const byPractice = new Map<string, Roll>();
    const firm = empty();

    for (const person of peopleQuery.data ?? []) {
      const practice = person.practice ?? "Unassigned";
      if (!byPractice.has(practice)) byPractice.set(practice, empty());
      const t = perPerson.get(person.personId) ?? { committed: 0, pipeline: 0 };
      const capacity = (person.weeklyCapacityHours || 40) * WEEKS_PER_YEAR;
      const chargeable = t.committed + t.pipeline;
      const forecastUtil = capacity > 0 ? (chargeable / capacity) * 100 : 0;
      const revenue = person.billRate != null ? t.committed * person.billRate : 0;

      for (const roll of [byPractice.get(practice)!, firm]) {
        roll.headcount += 1;
        roll.capacity += capacity;
        roll.committed += t.committed;
        roll.pipeline += t.pipeline;
        roll.revenue += revenue;
        if (person.billRate != null) roll.hasRates = true;
        if (person.utilizationTarget != null) {
          roll.targetSum += person.utilizationTarget;
          roll.targetCount += 1;
          if (forecastUtil >= person.utilizationTarget) roll.onTrack += 1;
          else roll.offTrack += 1;
        }
      }
    }

    const practiceRows = [...byPractice.entries()]
      .map(([practice, r]) => ({ practice, ...r }))
      .sort((a, b) => a.practice.localeCompare(b.practice));
    return { practiceRows, firm };
  }, [peopleQuery.data, allocationsQuery.data, projects]);

  const showRevenue = firm.hasRates;

  const renderRow = (label: string, r: typeof firm, emphasize = false) => {
    const forecastUtil = r.capacity > 0 ? ((r.committed + r.pipeline) / r.capacity) * 100 : 0;
    const avgTarget = r.targetCount > 0 ? r.targetSum / r.targetCount : null;
    const status = utilizationStatus(forecastUtil, avgTarget);
    return (
      <TableRow key={label} className={cn(emphasize && "font-semibold border-t-2")}>
        <TableCell className="font-medium">{label}</TableCell>
        <TableCell className="text-right">{r.headcount}</TableCell>
        <TableCell className="text-right">{r.capacity.toLocaleString()}</TableCell>
        <TableCell className="text-right">{r.committed.toLocaleString()}</TableCell>
        <TableCell className="text-right">{r.pipeline.toLocaleString()}</TableCell>
        <TableCell className={cn("text-right", status && rygTextClass[status])}>{forecastUtil.toFixed(1)}%</TableCell>
        <TableCell className="text-right">{avgTarget != null ? `${avgTarget.toFixed(0)}%` : "—"}</TableCell>
        <TableCell className="text-right">
          <Badge variant="ok">{r.onTrack}</Badge> / <Badge variant="over">{r.offTrack}</Badge>
        </TableCell>
        {showRevenue && <TableCell className="text-right">{r.revenue > 0 ? `$${Math.round(r.revenue).toLocaleString()}` : "—"}</TableCell>}
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Executive Summary</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {year} practice-level and firm-wide utilization rollup.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By practice</CardTitle>
          <CardDescription>
            Forecast utilization = (committed + pipeline hours) ÷ annual capacity. On/off track counts people vs. their
            individual targets.{showRevenue && " Committed revenue = committed hours × bill rate."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead className="text-right">Headcount</TableHead>
                  <TableHead className="text-right">Capacity (hrs)</TableHead>
                  <TableHead className="text-right">Committed (hrs)</TableHead>
                  <TableHead className="text-right">Pipeline (hrs)</TableHead>
                  <TableHead className="text-right">Forecast util</TableHead>
                  <TableHead className="text-right">Avg target</TableHead>
                  <TableHead className="text-right">On / off track</TableHead>
                  {showRevenue && <TableHead className="text-right">Committed revenue</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {practiceRows.map((r) => renderRow(r.practice, r))}
                {renderRow("Firm total", firm, true)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
