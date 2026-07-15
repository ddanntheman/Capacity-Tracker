import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { currentWeekStart, weekRange } from "@/lib/weeks";
import { capacityForWeek } from "@/lib/holidays";
import { practiceWeeklyRollup, utilizationBand } from "@/lib/practiceUtilization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const HORIZON_WEEKS = 12;

export default function PracticeDetailPage() {
  const { id = "" } = useParams();

  const { data: practices = [], isLoading } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });
  const { data: people = [] } = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });

  const start = currentWeekStart();
  const { data: allocations = [] } = useQuery({
    queryKey: ["allocations", start, HORIZON_WEEKS],
    queryFn: () => api.listAllocations(start, HORIZON_WEEKS),
  });

  const practice = practices.find((p) => p.practiceId === id);
  const leadName = people.find((p) => p.personId === practice?.leadId)?.displayName;

  const projectStatus = useMemo(() => new Map(projects.map((p) => [p.projectId, p.status])), [projects]);
  const weeks = useMemo(() => weekRange(start, HORIZON_WEEKS), [start]);

  const members = useMemo(() => {
    if (!practice) return [];
    const inPractice = people.filter((p) => p.practice === practice.name && p.isActive);
    return inPractice
      .map((person) => {
        let committed = 0;
        let pipeline = 0;
        const projectsForPerson = new Set<string>();
        for (const a of allocations) {
          if (a.personId !== person.personId) continue;
          projectsForPerson.add(a.projectId);
          if (projectStatus.get(a.projectId) === "pipeline") pipeline += a.hours;
          else committed += a.hours;
        }
        const capacity = weeks.reduce((s, w) => s + capacityForWeek(w, person.weeklyCapacityHours || 40), 0);
        const available = Math.max(0, capacity - committed - pipeline);
        return { person, committed, pipeline, available, capacity, projectCount: projectsForPerson.size };
      })
      .sort((a, b) => b.committed + b.pipeline - (a.committed + a.pipeline));
  }, [practice, people, allocations, projectStatus, weeks]);

  const weekly = useMemo(
    () =>
      practiceWeeklyRollup(
        members.map((m) => m.person),
        allocations,
        projects,
        weeks,
      ),
    [members, allocations, projects, weeks],
  );

  const rankMix = useMemo(() => {
    const byRank = new Map<string, { headcount: number; committed: number; pipeline: number; available: number; capacity: number }>();
    for (const m of members) {
      const key = m.person.rank ?? "Unranked";
      const entry = byRank.get(key) ?? { headcount: 0, committed: 0, pipeline: 0, available: 0, capacity: 0 };
      entry.headcount += 1;
      entry.committed += m.committed;
      entry.pipeline += m.pipeline;
      entry.available += m.available;
      entry.capacity += m.capacity;
      byRank.set(key, entry);
    }
    return [...byRank.entries()].sort((a, b) => b[1].capacity - a[1].capacity);
  }, [members]);

  const rollup = useMemo(() => {
    let committed = 0;
    let pipeline = 0;
    let capacity = 0;
    for (const m of members) {
      committed += m.committed;
      pipeline += m.pipeline;
      capacity += m.capacity;
    }
    const utilization = capacity > 0 ? Math.round(((committed + pipeline) / capacity) * 100) : null;
    return { committed, pipeline, capacity, utilization, available: Math.max(0, capacity - committed - pipeline) };
  }, [members]);

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;
  }
  if (!practice) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted-foreground)]">Practice not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/practices">
            <ArrowLeft className="size-4" /> Back to practices
          </Link>
        </Button>
      </div>
    );
  }

  const target = practice.defaultUtilizationTarget;
  const onTrack = target != null && rollup.utilization != null ? rollup.utilization >= target : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-[var(--color-muted-foreground)]">
          <Link to="/practices" className="hover:underline">
            Practices
          </Link>{" "}
          / {practice.name}
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{practice.name}</h1>
          {practice.isArchived && <Badge variant="secondary">Archived</Badge>}
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {[leadName && `Lead: ${leadName}`, `${members.length} ${members.length === 1 ? "person" : "people"}`, `next ${HORIZON_WEEKS} weeks`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Committed hrs" value={`${rollup.committed}`} description="Signed work over horizon" />
        <SummaryCard title="Pipeline hrs" value={`${rollup.pipeline}`} description="Soft-booked over horizon" />
        <SummaryCard title="Available hrs" value={`${rollup.available}`} description="Unbooked capacity" />
        <SummaryCard
          title="Utilization"
          value={rollup.utilization != null ? `${rollup.utilization}%` : "—"}
          description={
            target != null
              ? onTrack
                ? `On track (target ${target}%)`
                : `Below target ${target}%`
              : "No target set"
          }
          tone={onTrack == null ? "default" : onTrack ? "ok" : "warn"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly utilization</CardTitle>
          <CardDescription>
            Booked hours ÷ capacity per week{target != null ? ` vs the ${target}% target` : ""}. Committed + pipeline both count as booked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week of</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Pipeline</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Utilization</TableHead>
                  <TableHead>Vs target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekly.map((w) => {
                  const band = w.utilization != null && target != null ? utilizationBand(w.utilization, target) : null;
                  return (
                    <TableRow key={w.weekStart}>
                      <TableCell className="font-medium">{w.weekStart}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.committed}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.pipeline}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.capacity}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.utilization != null ? `${w.utilization}%` : "—"}</TableCell>
                      <TableCell>
                        {band === "ok" ? (
                          <Badge variant="ok">On target</Badge>
                        ) : band === "watch" ? (
                          <Badge variant="warn">Within 10 pts</Badge>
                        ) : band === "low" ? (
                          <Badge variant="over">Below target</Badge>
                        ) : (
                          <Badge variant="secondary">No target</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rank mix</CardTitle>
          <CardDescription>Booked vs available hours by rank over the next {HORIZON_WEEKS} weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Pipeline</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Utilization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankMix.map(([rank, r]) => (
                  <TableRow key={rank}>
                    <TableCell className="font-medium">{rank}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.headcount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.committed}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.pipeline}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.available}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.capacity > 0 ? `${Math.round(((r.committed + r.pipeline) / r.capacity) * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {rankMix.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[var(--color-muted-foreground)]">
                      No active people in this practice.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team allocation</CardTitle>
          <CardDescription>Where each member is booked over the next {HORIZON_WEEKS} weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Pipeline</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const util = m.capacity > 0 ? Math.round(((m.committed + m.pipeline) / m.capacity) * 100) : 0;
                  return (
                    <TableRow key={m.person.personId}>
                      <TableCell className="font-medium">
                        <Link to={`/people/${m.person.personId}`} className="hover:underline">
                          {m.person.displayName}
                        </Link>
                      </TableCell>
                      <TableCell>{m.person.rank ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.projectCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.committed}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.pipeline}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.available}</TableCell>
                      <TableCell>
                        {util >= 100 ? (
                          <Badge variant="over">Fully booked</Badge>
                        ) : util >= 80 ? (
                          <Badge variant="ok">{util}% booked</Badge>
                        ) : (
                          <Badge variant="secondary">{util}% booked</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[var(--color-muted-foreground)]">
                      No active people in this practice.
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

function SummaryCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string;
  description: string;
  tone?: "default" | "ok" | "warn";
}) {
  const color = tone === "ok" ? "text-[var(--color-ok)]" : tone === "warn" ? "text-[var(--color-over)]" : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className={`text-3xl ${color}`}>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
      </CardContent>
    </Card>
  );
}