import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { currentWeekStart, weekRange } from "@/lib/weeks";
import { capacityForWeek } from "@/lib/holidays";
import type { Person, Project } from "@/lib/types";
import { parseSkills } from "@/components/SkillsInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffRangeDialog } from "@/components/StaffRangeDialog";
import { useAuth } from "@/auth";

// Weights for the composite fit score (sum to 1). Availability dominates because
// a candidate who can't fit the hours is useless regardless of skill; utilization
// gap and skill match break ties among available people.
const W_AVAILABILITY = 0.5;
const W_UTILIZATION = 0.3;
const W_SKILL = 0.2;

export default function RecommendationsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");

  const [projectId, setProjectId] = useState("");
  const [weeks, setWeeks] = useState(8);
  const [hoursPerWeek, setHoursPerWeek] = useState(20);
  const [practice, setPractice] = useState("all");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [includeFull, setIncludeFull] = useState(false);
  const [staffPerson, setStaffPerson] = useState<Person | null>(null);

  const weekStart = currentWeekStart();
  const horizon = useMemo(() => weekRange(weekStart, weeks), [weekStart, weeks]);

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", weekStart, weeks],
    queryFn: () => api.listAllocations(weekStart, weeks),
  });
  const allPeople = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data]);
  const allProjects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const allAllocations = useMemo(() => allocationsQuery.data ?? [], [allocationsQuery.data]);

  const openProjects = useMemo(() => allProjects.filter((p) => p.status !== "closed"), [allProjects]);
  const project = openProjects.find((p) => p.projectId === projectId);

  const practices = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPeople) if (p.practice) set.add(p.practice);
    return [...set].sort();
  }, [allPeople]);

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPeople) for (const s of parseSkills(p.skills)) set.add(s);
    return [...set].sort();
  }, [allPeople]);

  const candidates = useMemo(() => {
    const projects = new Map<string, Project>();
    for (const p of allProjects) projects.set(p.projectId, p);

    // booked[personId][weekStart] -> committed + pipeline hours (closed projects excluded).
    const booked = new Map<string, Map<string, number>>();
    for (const a of allAllocations) {
      const proj = projects.get(a.projectId);
      if (!proj || proj.status === "closed") continue;
      if (!booked.has(a.personId)) booked.set(a.personId, new Map());
      const byWeek = booked.get(a.personId)!;
      byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.hours);
    }

    const requestedHours = weeks * hoursPerWeek;
    const wantSkills = requiredSkills.map((s) => s.toLowerCase());

    let people = allPeople;
    if (practice !== "all") people = people.filter((p) => p.practice === practice);

    return people
      .map((person) => {
        const byWeek = booked.get(person.personId);
        // Free hours across the horizon, and how many of the requested hours actually fit.
        let freeHours = 0;
        let fitHours = 0;
        let bookedHours = 0;
        let horizonCapacity = 0;
        for (const w of horizon) {
          const capacity = capacityForWeek(w, person.weeklyCapacityHours || 40);
          horizonCapacity += capacity;
          const used = byWeek?.get(w) ?? 0;
          bookedHours += used;
          const free = Math.max(0, capacity - used);
          freeHours += free;
          fitHours += Math.min(hoursPerWeek, free);
        }
        const availabilityScore = requestedHours > 0 ? fitHours / requestedHours : 0;

        // Utilization gap: people below their target get boosted so staffing helps
        // them reach it. Uses current booking over the horizon vs. target.
        const currentUtil = horizonCapacity > 0 ? (bookedHours / horizonCapacity) * 100 : 0;
        const target = person.utilizationTarget ?? 0;
        const utilizationGap = Math.max(0, target - currentUtil);
        const utilizationScore = target > 0 ? Math.min(1, utilizationGap / target) : 0;

        const personSkills = parseSkills(person.skills).map((s) => s.toLowerCase());
        const skillMatched = requiredSkills.filter((s) => personSkills.includes(s.toLowerCase()));
        const skillScore = wantSkills.length === 0 ? 1 : skillMatched.length / wantSkills.length;

        const score =
          W_AVAILABILITY * Math.min(1, availabilityScore) +
          W_UTILIZATION * utilizationScore +
          W_SKILL * skillScore;

        return {
          person,
          freeHours,
          requestedHours,
          fitHours,
          availabilityScore,
          utilizationGap,
          utilizationScore,
          skillMatched,
          skillScore,
          score,
        };
      })
      .filter((c) => (wantSkills.length === 0 ? true : c.skillMatched.length > 0))
      .filter((c) => (includeFull ? true : c.fitHours > 0))
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  }, [allPeople, allProjects, allAllocations, horizon, weeks, hoursPerWeek, practice, requiredSkills, includeFull]);

  const toggleSkill = (skill: string) =>
    setRequiredSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Staffing Recommendations</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Rank people to staff an engagement by availability, how far below their utilization target they are, and
          skill match over the next {weeks} weeks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Need</CardTitle>
          <CardDescription>Describe the role to staff; recommendations update instantly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Engagement</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select engagement (optional)" />
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
            <div className="space-y-1.5">
              <Label>Practice</Label>
              <Select value={practice} onValueChange={setPractice}>
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-weeks">Weeks</Label>
              <Input
                id="rec-weeks"
                type="number"
                min={1}
                max={52}
                className="w-24"
                value={weeks}
                onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-hours">Hrs/week</Label>
              <Input
                id="rec-hours"
                type="number"
                min={1}
                max={168}
                className="w-24"
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(Math.max(1, Math.min(168, Number(e.target.value) || 1)))}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={includeFull} onChange={(e) => setIncludeFull(e.target.checked)} />
              Include fully-booked people
            </label>
          </div>

          {allSkills.length > 0 && (
            <div className="space-y-1.5">
              <Label>Required skills</Label>
              <div className="flex flex-wrap gap-1">
                {allSkills.map((s) => {
                  const on = requiredSkills.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSkill(s)}
                      className={
                        on
                          ? "rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-[var(--color-primary-foreground)]"
                          : "rounded-full border px-2 py-0.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                      }
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {candidates.length} recommended {candidates.length === 1 ? "person" : "people"}
          </CardTitle>
          <CardDescription>
            Fit combines availability ({Math.round(W_AVAILABILITY * 100)}%), utilization gap (
            {Math.round(W_UTILIZATION * 100)}%), and skill match ({Math.round(W_SKILL * 100)}%). Need ={" "}
            {weeks * hoursPerWeek}h total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Practice</TableHead>
                <TableHead className="text-right">Free hrs</TableHead>
                <TableHead className="text-right">Fits need</TableHead>
                <TableHead className="text-right">Util gap</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead className="text-right">Fit</TableHead>
                {canEdit && <TableHead className="text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.person.personId}>
                  <TableCell className="font-medium">
                    <Link to={`/people/${c.person.personId}`} className="hover:underline">
                      {c.person.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>{c.person.rank ?? "—"}</TableCell>
                  <TableCell>{c.person.practice ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.freeHours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.fitHours}/{c.requestedHours}h
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.utilizationGap > 0 ? `${Math.round(c.utilizationGap)} pts` : "—"}
                  </TableCell>
                  <TableCell>
                    {requiredSkills.length === 0 ? (
                      <span className="text-[var(--color-muted-foreground)]">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {requiredSkills.map((s) => (
                          <Badge key={s} variant={c.skillMatched.includes(s) ? "ok" : "secondary"}>
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={c.score >= 0.66 ? "ok" : c.score >= 0.33 ? "warn" : "secondary"}>
                      {Math.round(c.score * 100)}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!project}
                        title={project ? undefined : "Select an engagement to staff into"}
                        onClick={() => setStaffPerson(c.person)}
                      >
                        Staff
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {candidates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-[var(--color-muted-foreground)]">
                    No one matches. Loosen the skill or practice filter, or include fully-booked people.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {staffPerson && project && (
        <StaffRangeDialog
          open={!!staffPerson}
          onOpenChange={(open) => !open && setStaffPerson(null)}
          project={project}
          person={staffPerson}
          defaults={{ weekStart, weeks, hoursPerWeek }}
        />
      )}
    </div>
  );
}
