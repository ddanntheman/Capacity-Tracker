import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { useAllocationRealtime } from "@/hooks/useRealtime";
import { currentWeekStart, shiftWeeks, weekLabel, weekRange } from "@/lib/weeks";
import type { Allocation, Person, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function totalVariant(total: number, capacity: number): "ok" | "warn" | "over" | "secondary" {
  if (total === 0) return "secondary";
  if (total > capacity) return "over";
  if (total >= capacity * 0.8) return "warn";
  return "ok";
}

export default function AllocationsPage() {
  const { me, hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const viewerOnly = !canEdit && !hasRole("leadership");
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [weeks, setWeeks] = useState(6);
  const visibleWeeks = useMemo(() => weekRange(weekStart, weeks), [weekStart, weeks]);

  const [editing, setEditing] = useState<{ person: Person; week: string } | null>(null);

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "picker"], queryFn: () => api.listProjects(true) });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", weekStart, weeks],
    queryFn: () => api.listAllocations(weekStart, weeks),
  });

  useAllocationRealtime(visibleWeeks, () => {
    void qc.invalidateQueries({ queryKey: ["allocations", weekStart, weeks] });
  });

  const people = useMemo(() => {
    const all = peopleQuery.data ?? [];
    return viewerOnly ? all.filter((p) => p.personId === me?.oid) : all;
  }, [peopleQuery.data, viewerOnly, me?.oid]);

  const projects = projectsQuery.data ?? [];

  // index[personId][weekStart] -> allocations
  const index = useMemo(() => {
    const allocations = allocationsQuery.data ?? [];
    const map = new Map<string, Map<string, Allocation[]>>();
    for (const a of allocations) {
      if (!map.has(a.personId)) map.set(a.personId, new Map());
      const byWeek = map.get(a.personId)!;
      if (!byWeek.has(a.weekStart)) byWeek.set(a.weekStart, []);
      byWeek.get(a.weekStart)!.push(a);
    }
    return map;
  }, [allocationsQuery.data]);

  const projectName = (id: string) => {
    const p = projects.find((x) => x.projectId === id);
    return p ? `${p.clientName} — ${p.projectName}` : id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Allocations</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Weekly grid. {canEdit ? "Click a cell to edit." : "Read-only view."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous weeks" onClick={() => setWeekStart(shiftWeeks(weekStart, -weeks))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(currentWeekStart())}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next weeks" onClick={() => setWeekStart(shiftWeeks(weekStart, weeks))}>
            <ChevronRight className="size-4" />
          </Button>
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[4, 6, 8, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Weekly allocations grid">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--color-card)] p-2 text-left font-medium">Person</th>
                  {visibleWeeks.map((w) => (
                    <th key={w} className="min-w-28 p-2 text-center font-medium text-[var(--color-muted-foreground)]">
                      {weekLabel(w)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.personId} className="border-t">
                    <td className="sticky left-0 z-10 bg-[var(--color-card)] p-2 font-medium">{person.displayName}</td>
                    {visibleWeeks.map((w) => {
                      const cell = index.get(person.personId)?.get(w) ?? [];
                      const total = cell.reduce((s, a) => s + a.hours, 0);
                      const capacity = person.weeklyCapacityHours || 40;
                      return (
                        <td key={w} className="p-1 align-top">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => canEdit && setEditing({ person, week: w })}
                            className="flex w-full flex-col gap-1 rounded-md border p-2 text-left transition-colors enabled:hover:bg-[var(--color-accent)] disabled:cursor-default"
                            aria-label={`${person.displayName}, week of ${w}, ${total} hours booked`}
                          >
                            <Badge variant={totalVariant(total, capacity)}>{total}h</Badge>
                            {cell.map((a) => (
                              <span key={a.allocationId} className="truncate text-xs text-[var(--color-muted-foreground)]">
                                {projectName(a.projectId)}: {a.hours}h
                              </span>
                            ))}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={visibleWeeks.length + 1} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      No people to display.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1"><Badge variant="ok">&lt;80% of capacity</Badge> available</span>
            <span className="flex items-center gap-1"><Badge variant="warn">80–100%</Badge> near/at capacity</span>
            <span className="flex items-center gap-1"><Badge variant="over">&gt;capacity</Badge> over-booked</span>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditAllocationsDialog
          person={editing.person}
          week={editing.week}
          projects={projects}
          existing={index.get(editing.person.personId)?.get(editing.week) ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ["allocations", weekStart, weeks] });
          }}
        />
      )}
    </div>
  );
}

function EditAllocationsDialog({
  person,
  week,
  projects,
  existing,
  onClose,
  onSaved,
}: {
  person: Person;
  week: string;
  projects: Project[];
  existing: Allocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of projects) {
      m[p.projectId] = existing.find((a) => a.projectId === p.projectId)?.hours ?? 0;
    }
    return m;
  }, [projects, existing]);

  const [values, setValues] = useState<Record<string, number>>(initial);
  const total = Object.values(values).reduce((s, v) => s + (v || 0), 0);
  const capacity = person.weeklyCapacityHours || 40;

  const save = useMutation({
    mutationFn: async () => {
      const changed = projects.filter((p) => (values[p.projectId] || 0) !== (initial[p.projectId] || 0));
      for (const p of changed) {
        await api.upsertAllocation({
          personId: person.personId,
          projectId: p.projectId,
          weekStart: week,
          hours: values[p.projectId] || 0,
        });
      }
    },
    onSuccess: () => {
      toast.success("Allocations saved");
      onSaved();
    },
    onError: () => {
      toast.error("Failed to save allocations");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{person.displayName}</DialogTitle>
          <DialogDescription>Week of {week}. Set the hours per project (0 removes it).</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-3 overflow-auto">
          {projects.length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">No active or pipeline projects available.</p>
          )}
          {projects.map((p) => (
            <div key={p.projectId} className="flex items-center justify-between gap-3">
              <Label htmlFor={p.projectId} className="flex-1">
                {p.clientName} — {p.projectName}
              </Label>
              <Input
                id={p.projectId}
                type="number"
                min={0}
                max={168}
                step={0.5}
                value={values[p.projectId] ?? 0}
                onChange={(e) => setValues((v) => ({ ...v, [p.projectId]: Math.max(0, Math.min(168, Number(e.target.value))) }))}
                className="w-24"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm">Weekly total (capacity {capacity}h)</span>
          <Badge variant={totalVariant(total, capacity)}>{total}h</Badge>
        </div>
        {total > capacity && <p className="text-sm text-[var(--color-warn)]">Booked over {capacity}h capacity.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
