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
import { SkillsInput, parseSkills, serializeSkills } from "@/components/SkillsInput";
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
function personBody(p: Person, patch: Partial<Person>): Omit<Person, "personId" | "isPlaceholder"> {
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
    certifications: merged.certifications,
    industryExperience: merged.industryExperience,
    staffingPreferences: merged.staffingPreferences,
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
  const [managingSkills, setManagingSkills] = useState(false);

  const filters = useUrlFilters({ q: "", rank: "all", practice: "all", status: "active", skill: "all" });
  const search = useSearchText(filters);
  const q = search.text;
  const rankFilter = filters.get("rank");
  const practiceFilter = filters.get("practice");
  const statusFilter = filters.get("status");
  const skillFilter = filters.get("skill");
  const includeInactive = statusFilter !== "active";

  const { data: allPeople = [], isLoading } = useQuery({
    queryKey: ["people", includeInactive],
    queryFn: () => api.listPeople(includeInactive),
  });
  const { data: practices = [] } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });

  const allSkills = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of allPeople) {
      for (const s of parseSkills(p.skills)) {
        const key = s.toLowerCase();
        if (!set.has(key)) set.set(key, s);
      }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [allPeople]);

  const people = useMemo(
    () =>
      allPeople.filter(
        (p) =>
          matchesSearch(q, p.displayName, p.email, p.practice, p.rank) &&
          (rankFilter === "all" || p.rank === rankFilter) &&
          (practiceFilter === "all" || p.practice === practiceFilter) &&
          (skillFilter === "all" ||
            parseSkills(p.skills).some((s) => s.toLowerCase() === skillFilter.toLowerCase())) &&
          (statusFilter === "all" || (statusFilter === "inactive" ? !p.isActive : p.isActive)),
      ),
    [allPeople, q, rankFilter, practiceFilter, skillFilter, statusFilter],
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
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setManagingSkills(true)}>
              Manage skills
            </Button>
          )}
          {canEdit && <PersonDialog people={people} />}
        </div>
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
        <Select value={skillFilter} onValueChange={(v) => filters.set("skill", v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All skills</SelectItem>
            {allSkills.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
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

      {managingSkills && <ManageSkillsDialog people={allPeople} onClose={() => setManagingSkills(false)} />}
    </div>
  );
}

function ManageSkillsDialog({ people, onClose }: { people: Person[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const tags = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const p of people) {
      for (const s of parseSkills(p.skills)) {
        const key = s.toLowerCase();
        const cur = counts.get(key);
        if (cur) cur.count += 1;
        else counts.set(key, { label: s, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [people]);

  // Apply a rename (newLabel != null) or delete (newLabel == null) of a skill across everyone who has it.
  const applyToAll = async (oldLabel: string, newLabel: string | null) => {
    setBusy(true);
    try {
      const affected = people.filter((p) => parseSkills(p.skills).some((s) => s.toLowerCase() === oldLabel.toLowerCase()));
      for (const p of affected) {
        const next = parseSkills(p.skills).filter((s) => s.toLowerCase() !== oldLabel.toLowerCase());
        if (newLabel) next.push(newLabel);
        await api.updatePerson(p.personId, personBody(p, { skills: next.length > 0 ? serializeSkills(next) : null }));
      }
      toast.success(newLabel ? `Renamed on ${affected.length} ${affected.length === 1 ? "person" : "people"}` : `Removed from ${affected.length} ${affected.length === 1 ? "person" : "people"}`);
      await qc.invalidateQueries({ queryKey: ["people"] });
      await qc.invalidateQueries({ queryKey: ["person"] });
    } catch {
      toast.error("Failed to update skills");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage skills</DialogTitle>
          <DialogDescription>
            Rename or delete a skill tag everywhere it is used. Skills are added per person from the edit dialog.
            Every change is written to each affected person and captured in the audit log.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((t) => (
              <SkillRow key={t.label} label={t.label} count={t.count} busy={busy} onApply={applyToAll} />
            ))}
            {tags.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[var(--color-muted-foreground)]">
                  No skills defined yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function SkillRow({
  label,
  count,
  busy,
  onApply,
}: {
  label: string;
  count: number;
  busy: boolean;
  onApply: (oldLabel: string, newLabel: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {editing ? (
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 w-48" />
        ) : (
          label
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{count}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={busy || !draft.trim() || draft.trim() === label}
                onClick={() => {
                  onApply(label, draft.trim());
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setDraft(label); setEditing(false); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onApply(label, null)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
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

function tagSuggestions(people: Person[], select: (p: Person) => string | null): string[] {
  const set = new Map<string, string>();
  for (const p of people) {
    for (const s of parseSkills(select(p))) {
      const key = s.toLowerCase();
      if (!set.has(key)) set.set(key, s);
    }
  }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}

export function PersonDialog({ person }: { people?: Person[]; person?: Person }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: practiceList = [] } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices(), enabled: open });
  const { data: skillPeople = [] } = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false), enabled: open });
  const skillSuggestions = useMemo(() => {
    const set = new Map<string, string>();
    for (const sp of skillPeople) {
      for (const s of parseSkills(sp.skills)) {
        const key = s.toLowerCase();
        if (!set.has(key)) set.set(key, s);
      }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [skillPeople]);
  const certificationSuggestions = useMemo(() => tagSuggestions(skillPeople, (sp) => sp.certifications), [skillPeople]);
  const industrySuggestions = useMemo(() => tagSuggestions(skillPeople, (sp) => sp.industryExperience), [skillPeople]);
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
  const [skills, setSkills] = useState<string[]>(parseSkills(person?.skills));
  const [certifications, setCertifications] = useState<string[]>(parseSkills(person?.certifications));
  const [industryExperience, setIndustryExperience] = useState<string[]>(parseSkills(person?.industryExperience));
  const [staffingPreferences, setStaffingPreferences] = useState(person?.staffingPreferences ?? "");
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
        skills: skills.length > 0 ? serializeSkills(skills) : null,
        certifications: certifications.length > 0 ? serializeSkills(certifications) : null,
        industryExperience: industryExperience.length > 0 ? serializeSkills(industryExperience) : null,
        staffingPreferences: staffingPreferences || null,
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
            <Label htmlFor="skills">Skills</Label>
            <SkillsInput value={skills} onChange={setSkills} suggestions={skillSuggestions} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="certifications">Certifications</Label>
            <SkillsInput value={certifications} onChange={setCertifications} suggestions={certificationSuggestions} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="industryExperience">Industry experience</Label>
            <SkillsInput value={industryExperience} onChange={setIndustryExperience} suggestions={industrySuggestions} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="staffingPreferences">Staffing preferences</Label>
            <Input
              id="staffingPreferences"
              placeholder="e.g. no travel, prefers healthcare projects"
              value={staffingPreferences}
              onChange={(e) => setStaffingPreferences(e.target.value)}
            />
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
