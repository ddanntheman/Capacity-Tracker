import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const RANKS = [
  "Analyst",
  "Associate",
  "Senior Associate",
  "Consultant",
  "Senior Consultant",
  "Manager",
  "Senior Manager",
  "Director",
  "Managing Director",
  "Partner",
];

/** Default billable utilization targets (%) by rank. */
export const DEFAULT_UTILIZATION_TARGETS: Record<string, number> = {
  Analyst: 85,
  Associate: 85,
  "Senior Associate": 85,
  Consultant: 85,
  "Senior Consultant": 80,
  Manager: 80,
  "Senior Manager": 65,
  Director: 40,
  "Managing Director": 20,
  Partner: 20,
};

export default function PeoplePage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people", includeInactive],
    queryFn: () => api.listPeople(includeInactive),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivatePerson(id),
    onSuccess: () => {
      toast.success("Person deactivated");
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: () => toast.error("Failed to deactivate"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">People</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Consultant records and reporting lines.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          {canEdit && <PersonDialog people={people} />}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Practice</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.personId}>
                    <TableCell className="font-medium">
                      <Link to={`/people/${p.personId}`} className="hover:underline">
                        {p.displayName}
                      </Link>
                    </TableCell>
                    <TableCell>{p.email}</TableCell>
                    <TableCell>{p.rank ?? p.jobTitle ?? "—"}</TableCell>
                    <TableCell>{p.practice ?? "—"}</TableCell>
                    <TableCell>{people.find((m) => m.personId === p.managerId)?.displayName ?? "—"}</TableCell>
                    <TableCell>
                      {p.isActive ? <Badge variant="ok">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PersonDialog people={people} person={p} />
                          {p.isActive && (
                            <Button variant="outline" size="sm" onClick={() => deactivate.mutate(p.personId)}>
                              Deactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {people.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-[var(--color-muted-foreground)]">
                      No people yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PersonDialog({ people, person }: { people: Person[]; person?: Person }) {
  const { hasRole } = useAuth();
  const isLeadership = hasRole("leadership");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(person?.displayName ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [jobTitle, setJobTitle] = useState(person?.jobTitle ?? "");
  const [managerId, setManagerId] = useState(person?.managerId ?? "");
  const [rank, setRank] = useState(person?.rank ?? "");
  const [practice, setPractice] = useState(person?.practice ?? "");
  const [location, setLocation] = useState(person?.location ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [startDate, setStartDate] = useState(person?.startDate ?? "");
  const [costRate, setCostRate] = useState(person?.costRate != null ? String(person.costRate) : "");
  const [billRate, setBillRate] = useState(person?.billRate != null ? String(person.billRate) : "");
  const [utilizationTarget, setUtilizationTarget] = useState(
    person?.utilizationTarget != null ? String(person.utilizationTarget) : "",
  );
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(String(person?.weeklyCapacityHours ?? 40));
  const [skills, setSkills] = useState(person?.skills ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [isActive, setIsActive] = useState(person?.isActive ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        displayName,
        email,
        jobTitle: jobTitle || null,
        managerId: managerId || null,
        rank: rank || null,
        practice: practice || null,
        location: location || null,
        phone: phone || null,
        startDate: startDate || null,
        costRate: costRate === "" ? null : Number(costRate),
        billRate: billRate === "" ? null : Number(billRate),
        utilizationTarget: utilizationTarget === "" ? null : Number(utilizationTarget),
        weeklyCapacityHours: weeklyCapacityHours === "" ? 40 : Number(weeklyCapacityHours),
        skills: skills || null,
        notes: notes || null,
        isActive,
      };
      return person ? api.updatePerson(person.personId, body) : api.createPerson(body);
    },
    onSuccess: () => {
      toast.success(person ? "Person updated" : "Person created");
      void qc.invalidateQueries({ queryKey: ["people"] });
      void qc.invalidateQueries({ queryKey: ["person"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? "Check the form fields" : "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {person ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add person
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Rank</Label>
            <Select
              value={rank || "none"}
              onValueChange={(v) => {
                const next = v === "none" ? "" : v;
                setRank(next);
                if (next && utilizationTarget === "" && DEFAULT_UTILIZATION_TARGETS[next] != null) {
                  setUtilizationTarget(String(DEFAULT_UTILIZATION_TARGETS[next]));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="No rank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No rank</SelectItem>
                {RANKS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Job title</Label>
            <Input id="title" value={jobTitle ?? ""} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="practice">Practice</Label>
            <Input id="practice" value={practice} onChange={(e) => setPractice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Manager</Label>
            <Select value={managerId || "none"} onValueChange={(v) => setManagerId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="No manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No manager</SelectItem>
                {people
                  .filter((m) => m.personId !== person?.personId)
                  .map((m) => (
                    <SelectItem key={m.personId} value={m.personId}>
                      {m.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target">Utilization target (%)</Label>
            <Input
              id="target"
              type="number"
              min={0}
              max={100}
              value={utilizationTarget}
              onChange={(e) => setUtilizationTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="capacity">Weekly capacity (hours)</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              max={80}
              value={weeklyCapacityHours}
              onChange={(e) => setWeeklyCapacityHours(e.target.value)}
            />
          </div>
          {isLeadership && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="costRate">Cost rate ($/hr)</Label>
                <Input
                  id="costRate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={costRate}
                  onChange={(e) => setCostRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billRate">Bill rate ($/hr)</Label>
                <Input
                  id="billRate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={billRate}
                  onChange={(e) => setBillRate(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="skills">Skills (comma-separated)</Label>
            <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {person && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!displayName || !email || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
