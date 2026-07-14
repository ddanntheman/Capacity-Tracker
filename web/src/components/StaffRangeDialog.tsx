import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { currentWeekStart, mondayOf } from "@/lib/weeks";
import type { Person, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pin the project (staffing from a project page) or the person (from the tracker). */
  project?: Project;
  person?: Person;
  people?: Person[];
  projects?: Project[];
  defaults?: { weekStart?: string; weeks?: number; hoursPerWeek?: number };
}

/**
 * Staff a person on a project for a date range: start week + number of weeks +
 * hours/week. The API generates or updates one allocation per week; 0 hours
 * clears the range.
 */
export function StaffRangeDialog({ open, onOpenChange, project, person, people, projects, defaults }: StaffRangeDialogProps) {
  const qc = useQueryClient();
  const [personId, setPersonId] = useState(person?.personId ?? "");
  const [projectId, setProjectId] = useState(project?.projectId ?? "");
  const [startDate, setStartDate] = useState(defaults?.weekStart ?? currentWeekStart());
  const [weeks, setWeeks] = useState(defaults?.weeks ?? 4);
  const [hoursPerWeek, setHoursPerWeek] = useState(defaults?.hoursPerWeek ?? 20);

  const chosenPersonId = person?.personId ?? personId;
  const chosenProjectId = project?.projectId ?? projectId;

  const staff = useMutation({
    mutationFn: () =>
      api.rangeUpsertAllocations({
        personId: chosenPersonId,
        projectId: chosenProjectId,
        weekStart: mondayOf(new Date(`${startDate}T00:00:00`)),
        weeks,
        hoursPerWeek,
      }),
    onSuccess: (result) => {
      toast.success(hoursPerWeek === 0 ? "Staffing cleared for the range" : `Staffed ${weeks} week${weeks === 1 ? "" : "s"} at ${hoursPerWeek}h/wk`);
      if (result?.warning) toast.warning(result.warning);
      void qc.invalidateQueries({ queryKey: ["allocations"] });
      onOpenChange(false);
    },
    onError: (e) => {
      const msg = e instanceof ApiError && typeof e.body === "object" && e.body && "error" in e.body ? String((e.body as { error: string }).error) : "Failed to staff";
      toast.error(msg);
    },
  });

  const openProjects = (projects ?? []).filter((p) => p.status !== "closed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {project ? `Staff someone on ${project.projectName}` : person ? `Staff ${person.displayName}` : "Staff by date range"}
          </DialogTitle>
          <DialogDescription>
            Pick a start week and duration; one allocation per week is created at the given hours. Setting 0 hours clears the range.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (chosenPersonId && chosenProjectId) staff.mutate();
          }}
        >
          {!person && (
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {(people ?? []).map((p) => (
                    <SelectItem key={p.personId} value={p.personId}>
                      {p.displayName}
                      {p.rank ? ` · ${p.rank}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!project && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {openProjects.map((p) => (
                    <SelectItem key={p.projectId} value={p.projectId}>
                      {p.clientName} — {p.projectName} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="range-start">Start week</Label>
              <Input id="range-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-weeks">Weeks</Label>
              <Input
                id="range-weeks"
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-hours">Hrs/week</Label>
              <Input
                id="range-hours"
                type="number"
                min={0}
                max={168}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!chosenPersonId || !chosenProjectId || staff.isPending}>
              {staff.isPending ? "Staffing…" : "Staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
