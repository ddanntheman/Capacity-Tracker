import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import { mondayOf } from "@/lib/weeks";
import type { Project } from "@/lib/types";
import { utilizationStatus, rygTextClass } from "@/lib/ryg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlFilters } from "@/lib/urlFilters";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

const WEEKS_PER_YEAR = 52;

export default function ExecutiveSummaryPage() {
  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));

  const filters = useUrlFilters({ weighted: "0" });
  const weighted = filters.get("weighted") === "1";

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const practicesQuery = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", firstMonday, WEEKS_PER_YEAR],
    queryFn: () => api.listAllocations(firstMonday, WEEKS_PER_YEAR),
  });

  const projects = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projectsQuery.data ?? []) m.set(p.projectId, p);
    return m;
  }, [projectsQuery.data]);

  const practiceIdByName = useMemo(
    () => new Map((practicesQuery.data ?? []).map((p) => [p.name, p.practiceId])),
    [practicesQuery.data],
  );

  const { practiceRows, firm } = useMemo(() => {
    const perPerson = new Map<string, { committed: number; pipeline: number; weightedPipeline: number }>();
    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!perPerson.has(a.personId)) perPerson.set(a.personId, { committed: 0, pipeline: 0, weightedPipeline: 0 });
      const t = perPerson.get(a.personId)!;
      if (project.status === "pipeline") {
        t.pipeline += a.hours;
        t.weightedPipeline += a.hours * ((project.winProbability ?? 100) / 100);
      } else {
        t.committed += a.hours;
      }
    }

    type Roll = {
      headcount: number;
      capacity: number;
      committed: number;
      pipeline: number;
      weightedPipeline: number;
      chargeable: number;
      remaining: number;
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
      weightedPipeline: 0,
      chargeable: 0,
      remaining: 0,
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
      const t = perPerson.get(person.personId) ?? { committed: 0, pipeline: 0, weightedPipeline: 0 };
      const capacity = (person.weeklyCapacityHours || 40) * WEEKS_PER_YEAR;
      const chargeable = t.committed + (weighted ? t.weightedPipeline : t.pipeline);
      const forecastUtil = capacity > 0 ? (chargeable / capacity) * 100 : 0;
      const billableTarget = person.utilizationTarget != null ? (capacity * person.utilizationTarget) / 100 : null;
      const remaining = billableTarget != null ? Math.max(0, billableTarget - chargeable) : 0;
      const revenue = person.billRate != null ? t.committed * person.billRate : 0;

      for (const roll of [byPractice.get(practice)!, firm]) {
        roll.headcount += 1;
        roll.capacity += capacity;
        roll.committed += t.committed;
        roll.pipeline += t.pipeline;
        roll.weightedPipeline += t.weightedPipeline;
        roll.chargeable += chargeable;
        roll.remaining += remaining;
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
  }, [peopleQuery.data, allocationsQuery.data, projects, weighted]);

  const showRevenue = firm.hasRates;

  const exportCsv = () => {
    const util = (r: typeof firm) => (r.capacity > 0 ? ((r.chargeable / r.capacity) * 100).toFixed(1) : "");
    const avgTarget = (r: typeof firm) => (r.targetCount > 0 ? (r.targetSum / r.targetCount).toFixed(0) : "");
    const toRow = (label: string, r: typeof firm) => [
      label,
      r.headcount,
      r.capacity,
      r.committed,
      r.pipeline,
      Math.round(r.weightedPipeline),
      util(r),
      avgTarget(r),
      Math.round(r.remaining),
      r.onTrack,
      r.offTrack,
    ];
    downloadCsv(
      `executive-summary-${year}${weighted ? "-weighted" : ""}.csv`,
      ["Practice", "Headcount", "Capacity (hrs)", "Committed (hrs)", "Pipeline (hrs)", "Weighted pipeline (hrs)", "Forecast util %", "Avg target %", "Remaining to target (hrs)", "On track", "Off track"],
      [...practiceRows.map((r) => toRow(r.practice, r)), toRow("Firm total", firm)],
    );
  };

  const renderRow = (label: string, r: typeof firm, emphasize = false) => {
    const forecastUtil = r.capacity > 0 ? (r.chargeable / r.capacity) * 100 : 0;
    const avgTarget = r.targetCount > 0 ? r.targetSum / r.targetCount : null;
    const status = utilizationStatus(forecastUtil, avgTarget);
    const practiceId = emphasize ? undefined : practiceIdByName.get(label);
    return (
      <TableRow key={label} className={cn(emphasize && "font-semibold border-t-2")}>
        <TableCell className="font-medium">
          {practiceId ? (
            <Link to={`/practices/${practiceId}`} className="hover:underline">
              {label}
            </Link>
          ) : (
            label
          )}
        </TableCell>
        <TableCell className="text-right">{r.headcount}</TableCell>
        <TableCell className="text-right">{r.capacity.toLocaleString()}</TableCell>
        <TableCell className="text-right">{r.committed.toLocaleString()}</TableCell>
        <TableCell className="text-right">{r.pipeline.toLocaleString()}</TableCell>
        <TableCell className="text-right">{Math.round(r.weightedPipeline).toLocaleString()}</TableCell>
        <TableCell className={cn("text-right", status && rygTextClass[status])}>{forecastUtil.toFixed(1)}%</TableCell>
        <TableCell className="text-right">{avgTarget != null ? `${avgTarget.toFixed(0)}%` : "—"}</TableCell>
        <TableCell className="text-right">{Math.round(r.remaining).toLocaleString()}</TableCell>
        <TableCell className="text-right">
          <Badge variant="ok">{r.onTrack}</Badge> / <Badge variant="over">{r.offTrack}</Badge>
        </TableCell>
        {showRevenue && <TableCell className="text-right">{r.revenue > 0 ? `$${Math.round(r.revenue).toLocaleString()}` : "—"}</TableCell>}
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Executive Summary</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {year} practice-level and firm-wide utilization rollup.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={weighted}
              onChange={(e) => filters.set("weighted", e.target.checked ? "1" : "0")}
              className="size-4 accent-[var(--color-primary)]"
            />
            Weight pipeline by win %
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={peopleQuery.isLoading || allocationsQuery.isLoading}>
            <Download className="mr-1 size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By practice</CardTitle>
          <CardDescription>
            Forecast utilization = (committed + {weighted ? "win-weighted pipeline" : "pipeline"} hours) ÷ annual
            capacity. On/off track counts people vs. their individual targets. Remaining = hours still needed to reach
            each person's billable target.{showRevenue && " Committed revenue = committed hours × bill rate."}
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
                  <TableHead className="text-right">Weighted pipeline (hrs)</TableHead>
                  <TableHead className="text-right">Forecast util</TableHead>
                  <TableHead className="text-right">Avg target</TableHead>
                  <TableHead className="text-right">Remaining (hrs)</TableHead>
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
