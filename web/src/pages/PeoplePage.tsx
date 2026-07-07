import { useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineInput, InlineSelect } from "@/components/InlineEdit";
import { matchesSearch, useSearchText, useUrlFilters } from "@/lib/urlFilters";

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

/** Full update body for a person with a partial patch applied (the API replaces the whole record). */
function personBody(p: Person, patch: Partial<Person>): Omit<Person, "personId"> {
  const merged = { ...p, ...patch };
  return {
    displayName: merged.displayName,
    email: merged.email,
    jobTitle: merged.jobTitle,
    managerId: merged.managerId,
    rank: merged.rank,
    practice: merged.practice,
    location: merged.location,
    phone: merged.phone,
    startDate: merged.startDate,
    costRate: merged.costRate,
    billRate: merged.billRate,
    utilizationTarget: merged.utilizationTarget,
    weeklyCapacityHours: merged.weeklyCapacityHours,
    skills: merged.skills,
    notes: merged.notes,
    isActive: merged.isActive,
  };
}

export default function PeoplePage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const isLeadership = hasRole("leadership");
  const qc = useQueryClient();
  const [mergeSource, setMergeSource] = useState<Person | null>(null);

  const filters = useUrlFilters({ q: "", rank: "all", practice: "all", status: "active" });
  const search = useSearchText(filters);
  const q = search.text;
  const rankFilter = filters.get("rank");
  const practiceFilter = filters.get("practice");
  const statusFilter = filters.get("status");
  const includeInactive = statusFilter !== "active";

  const { data: allPeople = [], isLoading } = useQuery({
    queryKey: ["people", includeInactive],
    queryFn: () => api.listPeople(includeInactive),
  });
  const { data: practices = [] } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });

  const people = useMemo(
    () =>
      allPeople.filter(
        (p) =>
          matchesSearch(q, p.displayName, p.email, p.practice, p.rank) &&
          (rankFilter === "all" || p.rank === rankFilter) &&
          (practiceFilter === "all" || p.practice === practiceFilter) &&
          (statusFilter === "all" || (statusFilter === "inactive" ? !p.isActive : p.isActive)),
      ),
    [allPeople, q, rankFilter, practiceFilter, statusFilter],
  );

  const inlineUpdate = useMutation({
    mutationFn: ({ person, patch }: { person: Person; patch: Partial<Person> }) =>
      api.updatePerson(person.personId, personBody(person, patch)),
    onSuccess: () => {
      toast.success("Person updated");
      void qc.invalidateQueries({ queryKey: ["people"] });
      void qc.invalidateQueries({ queryKey: ["person"] });
    },
    onError: () => toast.error("Failed to update"),
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
        {canEdit && <PersonDialog people={people} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, email…"
          value={search.text}
          onChange={(e) => search.onChange(e.target.value)}
          className="w-56"
        />
        <Select value={rankFilter} onValueChange={(v) => filters.set("rank", v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ranks</SelectItem>
            {RANKS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={practiceFilter} onValueChange={(v) => filters.set("practice", v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All practices</SelectItem>
            {practices.map((pr) => (
              <SelectItem key={pr.practiceId} value={pr.name}>
                {pr.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => filters.set("status", v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
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
                  <TableHead className="text-right">Target %</TableHead>
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
                    <TableCell>
                      <InlineSelect
                        value={p.rank ?? ""}
                        display={p.rank ?? p.jobTitle ?? "—"}
                        disabled={!canEdit}
                        allowNone
                        noneLabel="No rank"
                        options={RANKS.map((r) => ({ value: r, label: r }))}
                        onSave={(v) => inlineUpdate.mutate({ person: p, patch: { rank: v || null } })}
                      />
                    </TableCell>
                    <TableCell>
                      <InlineSelect
                        value={p.practice ?? ""}
                        display={p.practice ?? "—"}
                        disabled={!canEdit}
                        allowNone
                        noneLabel="No practice"
                        options={practices.filter((pr) => !pr.isArchived || pr.name === p.practice).map((pr) => ({ value: pr.name, label: pr.name }))}
                        onSave={(v) => inlineUpdate.mutate({ person: p, patch: { practice: v || null } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        max={100}
                        value={p.utilizationTarget != null ? String(p.utilizationTarget) : ""}
                        display={p.utilizationTarget != null ? `${p.utilizationTarget}%` : "—"}
                        disabled={!canEdit}
                        className="justify-end"
                        inputClassName="text-right"
                        onSave={(v) => inlineUpdate.mutate({ person: p, patch: { utilizationTarget: v === "" ? null : Number(v) } })}
                      />
                    </TableCell>
                    <TableCell>
                      {p.isActive ? <Badge variant="ok">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PersonDialog people={people} person={p} />
                          {isLeadership && (
                            <Button variant="outline" size="sm" onClick={() => setMergeSource(p)}>
                              Merge
                            </Button>
                          )}
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
                    <TableCell colSpan={6 + (canEdit ? 1 : 0)} className="text-center text-[var(--color-muted-foreground)]">
                      No people match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {mergeSource && (
        <MergePersonDialog
          source={mergeSource}
          targets={people.filter((p) => p.personId !== mergeSource.personId)}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            void qc.invalidateQueries({ queryKey: ["people"] });
            void qc.invalidateQueries({ queryKey: ["person"] });
          }}
        />
      )}
    </div>
  );
}

function MergePersonDialog({
  source,
  targets,
  onClose,
  onMerged,
}: {
  source: Person;
  targets: Person[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState("");

  const merge = useMutation({
    mutationFn: () => api.mergePerson(source.personId, targetId),
    onSuccess: () => {
      toast.success("People merged");
      onMerged();
    },
    onError: () => toast.error("Failed to merge people"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge “{source.displayName}”</DialogTitle>
          <DialogDescription>
            All of {source.displayName}'s allocations and actuals move to the person you pick, their profile details
            fill in any blanks, and this record is deleted. Use this to combine a duplicate sign-in account with the
            person's real record. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Merge into</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select person to keep" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.personId} value={t.personId}>
                  {t.displayName} ({t.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => merge.mutate()} disabled={!targetId || merge.isPending}>
            {merge.isPending ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PersonDialog({ person }: { people?: Person[]; person?: Person }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: practiceList = [] } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices(), enabled: open });
  const [displayName, setDisplayName] = useState(person?.displayName ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [jobTitle, setJobTitle] = useState(person?.jobTitle ?? "");
  const [rank, setRank] = useState(person?.rank ?? "");
  const [practice, setPractice] = useState(person?.practice ?? "");
  const [location, setLocation] = useState(person?.location ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [startDate, setStartDate] = useState(person?.startDate ?? "");
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
        managerId: person?.managerId ?? null,
        rank: rank || null,
        practice: practice || null,
        location: location || null,
        phone: phone || null,
        startDate: startDate || null,
        costRate: person?.costRate ?? null,
        billRate: person?.billRate ?? null,
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
            <Label>Practice</Label>
            <Select
              value={practice || "none"}
              onValueChange={(v) => {
                const next = v === "none" ? "" : v;
                setPractice(next);
                const defaultTarget = practiceList.find((pr) => pr.name === next)?.defaultUtilizationTarget;
                if (next && utilizationTarget === "" && defaultTarget != null) {
                  setUtilizationTarget(String(defaultTarget));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="No practice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No practice</SelectItem>
                {practiceList
                  .filter((pr) => !pr.isArchived || pr.name === practice)
                  .map((pr) => (
                    <SelectItem key={pr.practiceId} value={pr.name}>
                      {pr.name}
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
