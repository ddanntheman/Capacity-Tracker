import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { mondayOf, weekLabel } from "@/lib/weeks";
import type { Person, Project } from "@/lib/types";
import { useAuth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineInput, InlineSelect } from "@/components/InlineEdit";
import { StaffRangeDialog } from "@/components/StaffRangeDialog";

const WEEKS_PER_YEAR = 52;
const ENGAGEMENT_TYPES = ["T&M", "Fixed fee", "Milestone", "Retainer"];

interface TeamRow {
  person: Person;
  firstWeek: string;
  lastWeek: string;
  weekCount: number;
  totalHours: number;
  hoursPerWeek: number;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const qc = useQueryClient();
  const [staffOpen, setStaffOpen] = useState(false);
  const [editRow, setEditRow] = useState<TeamRow | null>(null);

  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", firstMonday, WEEKS_PER_YEAR],
    queryFn: () => api.listAllocations(firstMonday, WEEKS_PER_YEAR),
  });

  const project = (projectsQuery.data ?? []).find((p) => p.projectId === id);
  const clientId = (clientsQuery.data ?? []).find((c) => c.name === project?.clientName)?.clientId;

  const team = useMemo<TeamRow[]>(() => {
    const byPerson = new Map<string, { weeks: string[]; total: number }>();
    for (const a of allocationsQuery.data ?? []) {
      if (a.projectId !== id || a.hours <= 0) continue;
      if (!byPerson.has(a.personId)) byPerson.set(a.personId, { weeks: [], total: 0 });
      const entry = byPerson.get(a.personId)!;
      entry.weeks.push(a.weekStart);
      entry.total += a.hours;
    }
    const people = new Map((peopleQuery.data ?? []).map((p) => [p.personId, p]));
    return [...byPerson.entries()]
      .flatMap(([personId, e]) => {
        const person = people.get(personId);
        if (!person) return [];
        const weeks = e.weeks.sort();
        return [
          {
            person,
            firstWeek: weeks[0],
            lastWeek: weeks[weeks.length - 1],
            weekCount: weeks.length,
            totalHours: e.total,
            hoursPerWeek: Math.round((e.total / weeks.length) * 10) / 10,
          },
        ];
      })
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [allocationsQuery.data, peopleQuery.data, id]);

  const inlineUpdate = useMutation({
    mutationFn: (patch: Partial<Project>) => {
      const merged = { ...project!, ...patch };
      return api.updateProject(project!.projectId, {
        clientName: merged.clientName,
        projectName: merged.projectName,
        startDate: merged.startDate,
        endDate: merged.endDate,
        status: merged.status,
        dealValue: merged.dealValue,
        winProbability: merged.winProbability,
        engagementType: merged.engagementType,
        deliveryLeadId: merged.deliveryLeadId,
        notes: merged.notes,
      });
    },
    onSuccess: () => {
      toast.success("Project updated");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.error("Failed to update"),
  });

  const clearRange = useMutation({
    mutationFn: (row: TeamRow) =>
      api.rangeUpsertAllocations({
        personId: row.person.personId,
        projectId: id!,
        weekStart: row.firstWeek,
        weeks: Math.min(52, weeksBetween(row.firstWeek, row.lastWeek) + 1),
        hoursPerWeek: 0,
      }),
    onSuccess: () => {
      toast.success("Removed from project");
      void qc.invalidateQueries({ queryKey: ["allocations"] });
    },
    onError: () => toast.error("Failed to remove"),
  });

  if (projectsQuery.isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;
  }

  if (!project) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted-foreground)]">Project not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {clientId ? (
              <Link to={`/clients/${clientId}`} className="hover:underline">
                {project.clientName}
              </Link>
            ) : (
              project.clientName
            )}
          </p>
          <h1 className="text-2xl font-semibold">
            {canEdit ? (
              <InlineInput
                value={project.projectName}
                onSave={(v) => inlineUpdate.mutate({ projectName: v })}
                display={project.projectName}
              />
            ) : (
              project.projectName
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={project.status === "active" ? "ok" : project.status === "pipeline" ? "warn" : "secondary"}>
              {project.status}
            </Badge>
            {canEdit ? (
              <InlineSelect
                value={project.engagementType ?? ""}
                options={ENGAGEMENT_TYPES.map((t) => ({ value: t, label: t }))}
                onSave={(v) => inlineUpdate.mutate({ engagementType: v || null })}
                display={project.engagementType ?? "Set type"}
              />
            ) : (
              <span>{project.engagementType ?? "—"}</span>
            )}
            <span className="text-[var(--color-muted-foreground)]">
              {project.startDate}
              {project.endDate ? ` → ${project.endDate}` : ""}
            </span>
          </div>
        </div>
        {canEdit && <Button onClick={() => setStaffOpen(true)}>Staff person</Button>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery team</CardTitle>
          <CardDescription>
            Everyone with hours on this project in {year}. Staffing uses date ranges — start week + weeks + hours/week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Practice</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Weeks</TableHead>
                <TableHead className="text-right">Avg hrs/wk</TableHead>
                <TableHead className="text-right">Total hrs</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((row) => (
                <TableRow key={row.person.personId}>
                  <TableCell className="font-medium">
                    <Link to={`/people/${row.person.personId}`} className="hover:underline">
                      {row.person.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.person.rank ?? "—"}</TableCell>
                  <TableCell>{row.person.practice ?? "—"}</TableCell>
                  <TableCell>{weekLabel(row.firstWeek)}</TableCell>
                  <TableCell>{weekLabel(row.lastWeek)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.weekCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.hoursPerWeek}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.totalHours}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditRow(row)}>
                          Edit range
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => clearRange.mutate(row)} disabled={clearRange.isPending}>
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {team.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-[var(--color-muted-foreground)]">
                    Nobody staffed yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {staffOpen && (
        <StaffRangeDialog
          open={staffOpen}
          onOpenChange={setStaffOpen}
          project={project}
          people={peopleQuery.data ?? []}
        />
      )}
      {editRow && (
        <StaffRangeDialog
          open={!!editRow}
          onOpenChange={(open) => !open && setEditRow(null)}
          project={project}
          person={editRow.person}
          defaults={{
            weekStart: editRow.firstWeek,
            weeks: Math.min(52, weeksBetween(editRow.firstWeek, editRow.lastWeek) + 1),
            hoursPerWeek: editRow.hoursPerWeek,
          }}
        />
      )}
    </div>
  );
}

function weeksBetween(firstIso: string, lastIso: string): number {
  const ms = new Date(`${lastIso}T00:00:00`).getTime() - new Date(`${firstIso}T00:00:00`).getTime();
  return Math.round(ms / (7 * 24 * 3600 * 1000));
}
