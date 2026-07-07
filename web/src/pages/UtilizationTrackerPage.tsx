import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { currentWeekStart, mondayOf, shiftWeeks, weekLabel, weekRange } from "@/lib/weeks";
import type { Person, Project } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffRangeDialog } from "@/components/StaffRangeDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { availabilityStatus, rygCellClass } from "@/lib/ryg";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/csv";
import { matchesSearch, useSearchText, useUrlFilters } from "@/lib/urlFilters";
import type { Allocation } from "@/lib/types";

type WeekBucket = { committed: number; pipeline: number; committedProjects: string[]; pipelineProjects: string[] };

export default function UtilizationTrackerPage() {
  const { me, hasRole } = useAuth();
  const viewerOnly = !hasRole("editor") && !hasRole("leadership");
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const filters = useUrlFilters({ q: "", practice: "all", weeks: "12", person: "", view: "detail" });
  const search = useSearchText(filters);
  const q = search.text;
  const practice = filters.get("practice");
  const weeks = Number(filters.get("weeks")) || 12;
  const view = filters.get("view") === "heatmap" ? "heatmap" : "detail";
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
    if (practice !== "all") all = all.filter((p) => p.practice === practice);
    return all.filter((p) => matchesSearch(q, p.displayName, p.rank, p.practice));
  }, [peopleQuery.data, practice, viewerOnly, me?.oid, q]);

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

  const loading = peopleQuery.isLoading || projectsQuery.isLoading || allocationsQuery.isLoading;

  // Firm-wide totals per visible week across the filtered people.
  const weekTotals = useMemo(() => {
    const totals = new Map<string, { committed: number; pipeline: number; available: number }>();
    for (const w of visibleWeeks) totals.set(w, { committed: 0, pipeline: 0, available: 0 });
    for (const person of people) {
      const capacity = person.weeklyCapacityHours || 40;
      const byWeek = index.get(person.personId);
      for (const w of visibleWeeks) {
        const bucket = byWeek?.get(w);
        const committed = bucket?.committed ?? 0;
        const pipeline = bucket?.pipeline ?? 0;
        const t = totals.get(w)!;
        t.committed += committed;
        t.pipeline += pipeline;
        t.available += Math.max(0, capacity - committed - pipeline);
      }
    }
    return totals;
  }, [people, index, visibleWeeks]);

  const exportCsv = () => {
    const header = ["Person", "Rank", "Practice", "Row", ...visibleWeeks.map(weekLabel)];
    const rows: (string | number)[][] = [];
    for (const person of people) {
      const capacity = person.weeklyCapacityHours || 40;
      const byWeek = index.get(person.personId);
      const committed = visibleWeeks.map((w) => byWeek?.get(w)?.committed ?? 0);
      const pipeline = visibleWeeks.map((w) => byWeek?.get(w)?.pipeline ?? 0);
      const available = visibleWeeks.map((_, i) => capacity - committed[i] - pipeline[i]);
      rows.push([person.displayName, person.rank ?? "", person.practice ?? "", "Committed", ...committed]);
      rows.push([person.displayName, person.rank ?? "", person.practice ?? "", "Pipeline", ...pipeline]);
      rows.push([person.displayName, person.rank ?? "", person.practice ?? "", "Available", ...available]);
    }
    downloadCsv(`utilization-tracker-${weekStart}.csv`, header, rows);
  };

  const canEdit = hasRole("editor");
  const overlayPersonId = filters.get("person");
  const overlayPerson = (peopleQuery.data ?? []).find((p) => p.personId === overlayPersonId);

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
          <Input placeholder="Search person…" value={search.text} onChange={(e) => search.onChange(e.target.value)} className="w-44" />
          <Select value={practice} onValueChange={(v) => filters.set("practice", v)}>
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
          <Select value={String(weeks)} onValueChange={(v) => filters.set("weeks", v)}>
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
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading}>
            <Download className="mr-1 size-4" /> Export CSV
          </Button>
          <div className="flex rounded-md border" role="group" aria-label="Grid view">
            <Button
              variant={view === "detail" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => filters.set("view", "detail")}
            >
              Detail
            </Button>
            <Button
              variant={view === "heatmap" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => filters.set("view", "heatmap")}
            >
              Heatmap
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Utilization tracker grid">
              <thead className="sticky top-0 z-20 bg-[var(--color-card)]">
                <tr>
                  <th className="sticky left-0 z-30 bg-[var(--color-card)] p-2 text-left font-medium">Person</th>
                  {view === "detail" && <th className="sticky left-40 z-30 bg-[var(--color-card)] p-2 text-left font-medium"> </th>}
                  {visibleWeeks.map((w) => (
                    <th key={w} className="min-w-16 p-2 text-center font-medium text-[var(--color-muted-foreground)]">
                      {weekLabel(w)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="p-2" colSpan={visibleWeeks.length + (view === "detail" ? 2 : 1)}>
                        <Skeleton className="h-12 w-full" />
                      </td>
                    </tr>
                  ))}
                {!loading && people.length > 0 && view === "detail" && (
                  <TeamTotalsRows weeks={visibleWeeks} totals={weekTotals} />
                )}
                {!loading &&
                  view === "detail" &&
                  people.map((person) => (
                    <PersonRows
                      key={person.personId}
                      person={person}
                      weeks={visibleWeeks}
                      byWeek={index.get(person.personId)}
                      onOpen={() => filters.set("person", person.personId)}
                    />
                  ))}
                {!loading &&
                  view === "heatmap" &&
                  people.map((person) => (
                    <HeatmapRow
                      key={person.personId}
                      person={person}
                      weeks={visibleWeeks}
                      byWeek={index.get(person.personId)}
                      onOpen={() => filters.set("person", person.personId)}
                    />
                  ))}
                {!loading && people.length === 0 && (
                  <tr>
                    <td colSpan={visibleWeeks.length + (view === "detail" ? 2 : 1)} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      No people to display.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
            {view === "detail" && (
              <>
                <span className="flex items-center gap-1"><Badge variant="ok">C</Badge> committed (won/sold work)</span>
                <span className="flex items-center gap-1"><Badge variant="warn">P</Badge> pipeline (likely to close)</span>
                <span className="flex items-center gap-1"><Badge variant="secondary">A</Badge> available (capacity − C − P)</span>
              </>
            )}
            {view === "heatmap" && <span>Each cell shows free hours (capacity − committed − pipeline).</span>}
            <span className="flex items-center gap-2">
              <span className={cn("inline-block size-3 rounded", rygCellClass.ok)} /> &gt;8h free
              <span className={cn("inline-block size-3 rounded", rygCellClass.warn)} /> 0–8h free
              <span className={cn("inline-block size-3 rounded", rygCellClass.over)} /> overbooked
            </span>
          </div>
        </CardContent>
      </Card>

      {overlayPerson && (
        <PersonStaffingOverlay
          person={overlayPerson}
          allocations={allocationsQuery.data ?? []}
          projects={projects}
          canEdit={canEdit}
          onClose={() => filters.set("person", "")}
        />
      )}
    </div>
  );
}

interface StaffingRow {
  project: Project;
  firstWeek: string;
  lastWeek: string;
  weekCount: number;
  totalHours: number;
  hoursPerWeek: number;
}

/**
 * Per-person staffing breakdown: which projects make up their committed vs
 * pipeline hours in the visible window, editable via date-range staffing.
 */
function PersonStaffingOverlay({
  person,
  allocations,
  projects,
  canEdit,
  onClose,
}: {
  person: Person;
  allocations: Allocation[];
  projects: Map<string, Project>;
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [staffOpen, setStaffOpen] = useState(false);
  const [editRow, setEditRow] = useState<StaffingRow | null>(null);

  const rows = useMemo<StaffingRow[]>(() => {
    const byProject = new Map<string, { weeks: string[]; total: number }>();
    for (const a of allocations) {
      if (a.personId !== person.personId || a.hours <= 0) continue;
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      if (!byProject.has(a.projectId)) byProject.set(a.projectId, { weeks: [], total: 0 });
      const e = byProject.get(a.projectId)!;
      e.weeks.push(a.weekStart);
      e.total += a.hours;
    }
    return [...byProject.entries()]
      .map(([projectId, e]) => {
        const weeks = e.weeks.sort();
        return {
          project: projects.get(projectId)!,
          firstWeek: weeks[0],
          lastWeek: weeks[weeks.length - 1],
          weekCount: weeks.length,
          totalHours: e.total,
          hoursPerWeek: Math.round((e.total / weeks.length) * 10) / 10,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [allocations, projects, person.personId]);

  const committedTotal = rows.filter((r) => r.project.status !== "pipeline").reduce((s, r) => s + r.totalHours, 0);
  const pipelineTotal = rows.filter((r) => r.project.status === "pipeline").reduce((s, r) => s + r.totalHours, 0);

  const clearRange = useMutation({
    mutationFn: (row: StaffingRow) =>
      api.rangeUpsertAllocations({
        personId: person.personId,
        projectId: row.project.projectId,
        weekStart: row.firstWeek,
        weeks: Math.min(52, Math.round((new Date(`${row.lastWeek}T00:00:00`).getTime() - new Date(`${row.firstWeek}T00:00:00`).getTime()) / (7 * 24 * 3600 * 1000)) + 1),
        hoursPerWeek: 0,
      }),
    onSuccess: () => {
      toast.success("Staffing removed");
      void qc.invalidateQueries({ queryKey: ["allocations"] });
    },
    onError: () => toast.error("Failed to remove"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{person.displayName} — staffing breakdown</DialogTitle>
          <DialogDescription>
            {committedTotal}h committed · {pipelineTotal}h pipeline in the visible window.
            {canEdit ? " Edit a range or staff onto a new project below." : ""}
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Hrs/wk</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.project.projectId}>
                <TableCell className="font-medium">
                  <Link to={`/projects/${r.project.projectId}`} className="hover:underline">
                    {r.project.clientName} — {r.project.projectName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={r.project.status === "pipeline" ? "warn" : "ok"}>
                    {r.project.status === "pipeline" ? "Pipeline" : "Committed"}
                  </Badge>
                </TableCell>
                <TableCell>{weekLabel(r.firstWeek)}</TableCell>
                <TableCell>{weekLabel(r.lastWeek)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.hoursPerWeek}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{r.totalHours}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditRow(r)}>
                        Edit range
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => clearRange.mutate(r)} disabled={clearRange.isPending}>
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-[var(--color-muted-foreground)]">
                  No staffing in the visible window.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={() => setStaffOpen(true)}>Staff on a project</Button>
          </div>
        )}
        {staffOpen && (
          <StaffRangeDialog
            open={staffOpen}
            onOpenChange={setStaffOpen}
            person={person}
            projects={[...projects.values()]}
          />
        )}
        {editRow && (
          <StaffRangeDialog
            open={!!editRow}
            onOpenChange={(o) => !o && setEditRow(null)}
            person={person}
            project={editRow.project}
            defaults={{
              weekStart: editRow.firstWeek,
              weeks: Math.min(52, Math.round((new Date(`${editRow.lastWeek}T00:00:00`).getTime() - new Date(`${editRow.firstWeek}T00:00:00`).getTime()) / (7 * 24 * 3600 * 1000)) + 1),
              hoursPerWeek: editRow.hoursPerWeek,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamTotalsRows({
  weeks,
  totals,
}: {
  weeks: string[];
  totals: Map<string, { committed: number; pipeline: number; available: number }>;
}) {
  const rows: { key: "committed" | "pipeline" | "available"; label: string; variant: "ok" | "warn" | "secondary" }[] = [
    { key: "committed", label: "C", variant: "ok" },
    { key: "pipeline", label: "P", variant: "warn" },
    { key: "available", label: "A", variant: "secondary" },
  ];
  return (
    <>
      {rows.map((row, i) => (
        <tr key={row.key} className={cn("bg-[var(--color-muted)]", i === 0 && "border-t")}>
          {i === 0 ? (
            <td rowSpan={3} className="sticky left-0 z-10 bg-[var(--color-muted)] p-2 align-top font-semibold">
              Team total
              <div className="text-xs font-normal text-[var(--color-muted-foreground)]">All filtered people</div>
            </td>
          ) : null}
          <td className="sticky left-40 z-10 bg-[var(--color-muted)] p-1">
            <Badge variant={row.variant}>{row.label}</Badge>
          </td>
          {weeks.map((w) => (
            <td key={w} className="p-1 text-center font-medium tabular-nums">
              {Math.round((totals.get(w)?.[row.key] ?? 0) * 10) / 10}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function HeatmapRow({
  person,
  weeks,
  byWeek,
  onOpen,
}: {
  person: Person;
  weeks: string[];
  byWeek: Map<string, WeekBucket> | undefined;
  onOpen: () => void;
}) {
  const capacity = person.weeklyCapacityHours || 40;
  return (
    <tr className="border-t">
      <td className="sticky left-0 z-10 bg-[var(--color-card)] p-2 font-medium">
        <button type="button" onClick={onOpen} className="text-left hover:underline">
          {person.displayName}
        </button>
        <div className="text-xs font-normal text-[var(--color-muted-foreground)]">
          {[person.rank, person.practice].filter(Boolean).join(" · ")}
        </div>
      </td>
      {weeks.map((w) => {
        const bucket = byWeek?.get(w);
        const committed = bucket?.committed ?? 0;
        const pipeline = bucket?.pipeline ?? 0;
        const free = capacity - committed - pipeline;
        const title = [
          `Committed ${committed}h`,
          `Pipeline ${pipeline}h`,
          ...(bucket?.committedProjects ?? []),
          ...(bucket?.pipelineProjects ?? []),
        ].join("\n");
        return (
          <td
            key={w}
            title={title}
            className={cn(
              "p-1 text-center tabular-nums",
              rygCellClass[availabilityStatus(free)],
              free < 0 && "font-medium",
            )}
          >
            {free}
          </td>
        );
      })}
    </tr>
  );
}

function PersonRows({
  person,
  weeks,
  byWeek,
  onOpen,
}: {
  person: Person;
  weeks: string[];
  byWeek: Map<string, WeekBucket> | undefined;
  onOpen: () => void;
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
              <button type="button" onClick={onOpen} className="text-left hover:underline">
                {person.displayName}
              </button>
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
