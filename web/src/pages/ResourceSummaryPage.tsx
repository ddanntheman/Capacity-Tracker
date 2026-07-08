import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchesSearch, useSearchText, useUrlFilters } from "@/lib/urlFilters";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

const WEEKS_PER_YEAR = 52;

type SortKey = "name" | "target" | "committed" | "pipeline" | "chargeable" | "util" | "vsTarget" | "remaining";

export default function ResourceSummaryPage() {
  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));

  const filters = useUrlFilters({ q: "", practice: "all", status: "all", weighted: "0" });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const search = useSearchText(filters);
  const q = search.text;
  const practiceFilter = filters.get("practice");
  const statusFilter = filters.get("status");
  const weighted = filters.get("weighted") === "1";

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
      const totalChargeable = t.committed + (weighted ? t.weightedPipeline : t.pipeline);
      const forecastUtil = baseHours > 0 ? (totalChargeable / baseHours) * 100 : 0;
      const vsTarget = target != null ? forecastUtil - target : null;
      const remaining = billableTarget != null ? billableTarget - totalChargeable : null;
      const status = utilizationStatus(forecastUtil, target ?? null);
      const actualToDate = actualsByPerson.get(person.personId) ?? 0;
      return { person, ...t, baseHours, target, billableTarget, totalChargeable, forecastUtil, vsTarget, remaining, status, actualToDate };
    });
  }, [peopleQuery.data, allocationsQuery.data, actualsQuery.data, projects, weighted]);

  const practices = useMemo(() => {
    const set = new Set<string>();
    for (const p of peopleQuery.data ?? []) if (p.practice) set.add(p.practice);
    return [...set].sort();
  }, [peopleQuery.data]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        matchesSearch(q, r.person.displayName, r.person.rank, r.person.practice) &&
        (practiceFilter === "all" || r.person.practice === practiceFilter) &&
        (statusFilter === "all" ||
          (statusFilter === "on-track" ? r.status === "ok" : statusFilter === "at-risk" ? r.status === "warn" : r.status === "over")),
    );
    const value = (r: (typeof rows)[number]): string | number => {
      switch (sort.key) {
        case "name":
          return r.person.displayName.toLowerCase();
        case "target":
          return r.target ?? -1;
        case "committed":
          return r.committed;
        case "pipeline":
          return r.pipeline;
        case "chargeable":
          return r.totalChargeable;
        case "util":
          return r.forecastUtil;
        case "vsTarget":
          return r.vsTarget ?? Number.NEGATIVE_INFINITY;
        case "remaining":
          return r.remaining ?? Number.NEGATIVE_INFINITY;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return cmp * sort.dir;
    });
  }, [rows, q, practiceFilter, statusFilter, sort]);

  const totals = useMemo(() => {
    const t = { committed: 0, pipeline: 0, weightedPipeline: 0, chargeable: 0, baseHours: 0, billableTarget: 0, remaining: 0 };
    for (const r of visibleRows) {
      t.committed += r.committed;
      t.pipeline += r.pipeline;
      t.weightedPipeline += r.weightedPipeline;
      t.chargeable += r.totalChargeable;
      t.baseHours += r.baseHours;
      t.billableTarget += r.billableTarget ?? 0;
      if (r.remaining != null) t.remaining += Math.max(0, r.remaining);
    }
    return t;
  }, [visibleRows]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));

  const exportCsv = () => {
    downloadCsv(
      `resource-summary-${year}.csv`,
      ["Name", "Level", "Practice", "Util target %", "Billable target (hrs)", "Committed (hrs)", "Pipeline (hrs)", "Weighted pipeline (hrs)", "Actual to date (hrs)", "Total chargeable (hrs)", "Forecast util %", "vs. target (pts)", "Remaining (hrs)", "Status"],
      visibleRows.map((r) => [
        r.person.displayName,
        r.person.rank ?? "",
        r.person.practice ?? "",
        r.target ?? "",
        r.billableTarget ?? "",
        r.committed,
        r.pipeline,
        Math.round(r.weightedPipeline),
        r.actualToDate,
        Math.round(r.totalChargeable),
        r.forecastUtil.toFixed(1),
        r.vsTarget != null ? r.vsTarget.toFixed(1) : "",
        r.remaining != null ? Math.max(0, Math.round(r.remaining)) : "",
        r.status == null ? "No target" : r.status === "ok" ? "On track" : r.status === "warn" ? "At risk" : "Off track",
      ]),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resource Summary</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {year} forecast: committed + pipeline hours vs. each person's utilization target.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search person…" value={search.text} onChange={(e) => search.onChange(e.target.value)} className="w-56" />
        <Select value={practiceFilter} onValueChange={(v) => filters.set("practice", v)}>
          <SelectTrigger className="w-44">
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
        <Select value={statusFilter} onValueChange={(v) => filters.set("status", v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="on-track">On track</SelectItem>
            <SelectItem value="at-risk">At risk</SelectItem>
            <SelectItem value="off-track">Off track</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={peopleQuery.isLoading || allocationsQuery.isLoading}>
          <Download className="mr-1 size-4" /> Export CSV
        </Button>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={weighted}
            onChange={(e) => filters.set("weighted", e.target.checked ? "1" : "0")}
            className="size-4 accent-[var(--color-primary)]"
          />
          Weight pipeline by win %
        </label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annual rollup</CardTitle>
          <CardDescription>
            Base hours = weekly capacity × {WEEKS_PER_YEAR} weeks. Billable target = base × utilization target.
            {weighted ? " Forecast counts pipeline at each engagement's win probability." : " Forecast counts pipeline at 100%."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[var(--color-card)]">
                <TableRow>
                  <SortHead label="Name" k="name" sort={sort} onSort={toggleSort} />
                  <TableHead>Level</TableHead>
                  <SortHead label="Util target" k="target" sort={sort} onSort={toggleSort} right />
                  <TableHead className="text-right">Billable target (hrs)</TableHead>
                  <SortHead label="Committed (hrs)" k="committed" sort={sort} onSort={toggleSort} right />
                  <SortHead label="Pipeline (hrs)" k="pipeline" sort={sort} onSort={toggleSort} right />
                  <TableHead className="text-right">Weighted pipeline (hrs)</TableHead>
                  <TableHead className="text-right">Actual to date (hrs)</TableHead>
                  <SortHead label="Total chargeable (hrs)" k="chargeable" sort={sort} onSort={toggleSort} right />
                  <SortHead label="Forecast util" k="util" sort={sort} onSort={toggleSort} right />
                  <SortHead label="vs. target" k="vsTarget" sort={sort} onSort={toggleSort} right />
                  <SortHead label="Remaining (hrs)" k="remaining" sort={sort} onSort={toggleSort} right />
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((r) => (
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
                    <TableCell className="text-right">{Math.round(r.totalChargeable)}</TableCell>
                    <TableCell className={cn("text-right font-medium", r.status && rygTextClass[r.status])}>
                      {r.forecastUtil.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {r.vsTarget != null ? `${r.vsTarget >= 0 ? "+" : ""}${r.vsTarget.toFixed(1)} pts` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.remaining != null ? Math.max(0, Math.round(r.remaining)) : "—"}</TableCell>
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
                {visibleRows.length > 0 && (
                  <TableRow className="sticky bottom-0 z-10 bg-[var(--color-muted)] font-medium">
                    <TableCell>Team total</TableCell>
                    <TableCell>{visibleRows.length} people</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">{totals.billableTarget}</TableCell>
                    <TableCell className="text-right">{totals.committed}</TableCell>
                    <TableCell className="text-right">{totals.pipeline}</TableCell>
                    <TableCell className="text-right">{Math.round(totals.weightedPipeline)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">{Math.round(totals.chargeable)}</TableCell>
                    <TableCell className="text-right">
                      {totals.baseHours > 0 ? `${((totals.chargeable / totals.baseHours) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">{Math.round(totals.remaining)}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                )}
                {visibleRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-[var(--color-muted-foreground)]">
                      No people match the current filters.
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

function SortHead({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <TableHead className={cn(right && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:underline", active && "font-semibold")}
      >
        {label}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );
}
