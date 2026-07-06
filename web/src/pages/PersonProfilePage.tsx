import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { currentWeekStart, shiftWeeks, weekLabel } from "@/lib/weeks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonDialog } from "@/pages/PeoplePage";

const LOOKBACK_WEEKS = 8;
const LOOKAHEAD_WEEKS = 4;

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function PersonProfilePage() {
  const { id = "" } = useParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const isLeadership = hasRole("leadership");

  const rangeStart = shiftWeeks(currentWeekStart(), -LOOKBACK_WEEKS);
  const totalWeeks = LOOKBACK_WEEKS + LOOKAHEAD_WEEKS;

  const { data: person, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: () => api.getPerson(id),
    enabled: !!id,
  });
  const { data: people = [] } = useQuery({
    queryKey: ["people", true],
    queryFn: () => api.listPeople(true),
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const { data: allocations = [] } = useQuery({
    queryKey: ["allocations", "person", id, rangeStart, totalWeeks],
    queryFn: () => api.listAllocations(rangeStart, totalWeeks, id),
    enabled: !!id,
  });

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;
  }
  if (!person) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted-foreground)]">Person not found.</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/people">
            <ArrowLeft className="size-4" /> Back to people
          </Link>
        </Button>
      </div>
    );
  }

  const manager = people.find((m) => m.personId === person.managerId);
  const directReports = people.filter((p) => p.managerId === person.personId && p.isActive);
  const skills = (person.skills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const today = currentWeekStart();
  const byWeek = new Map<string, number>();
  for (const a of allocations) {
    byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.hours);
  }
  const capacity = person.weeklyCapacityHours || 40;
  const pastWeeks = [...byWeek.entries()].filter(([w]) => w <= today);
  const actualUtilization =
    pastWeeks.length > 0
      ? Math.round((pastWeeks.reduce((sum, [, hrs]) => sum + hrs, 0) / (pastWeeks.length * capacity)) * 100)
      : null;
  const currentWeekTotal = byWeek.get(today) ?? 0;

  const currentAllocations = allocations
    .filter((a) => a.weekStart === today)
    .map((a) => ({
      ...a,
      project: projects.find((p) => p.projectId === a.projectId),
    }));

  const margin =
    person.costRate != null && person.billRate != null && person.billRate > 0
      ? Math.round(((person.billRate - person.costRate) / person.billRate) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link to="/people">
              <ArrowLeft className="size-4" /> People
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{person.displayName}</h1>
            {person.isActive ? <Badge variant="ok">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {[person.rank, person.jobTitle, person.practice].filter(Boolean).join(" · ") || "No rank or title set"}
          </p>
        </div>
        {canEdit && <PersonDialog people={people} person={person} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact & details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ProfileRow label="Email" value={person.email} />
            <ProfileRow label="Phone" value={person.phone ?? "—"} />
            <ProfileRow label="Location" value={person.location ?? "—"} />
            <ProfileRow label="Start date" value={person.startDate ?? "—"} />
            <ProfileRow
              label="Manager"
              value={
                manager ? (
                  <Link to={`/people/${manager.personId}`} className="hover:underline">
                    {manager.displayName}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {skills.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            {person.notes && <p className="pt-1 text-[var(--color-muted-foreground)]">{person.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Utilization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ProfileRow
              label="Target"
              value={person.utilizationTarget != null ? `${person.utilizationTarget}%` : "—"}
            />
            <ProfileRow
              label={`Actual (last ${LOOKBACK_WEEKS} wks)`}
              value={actualUtilization != null ? `${actualUtilization}%` : "—"}
            />
            <ProfileRow label="This week" value={`${currentWeekTotal} hrs`} />
            <ProfileRow label="Weekly capacity" value={`${person.weeklyCapacityHours} hrs`} />
            {person.utilizationTarget != null && actualUtilization != null && (
              <div className="pt-1">
                {actualUtilization >= person.utilizationTarget ? (
                  <Badge variant="ok">On target</Badge>
                ) : (
                  <Badge variant="secondary">
                    {person.utilizationTarget - actualUtilization}% below target
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {isLeadership && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ProfileRow label="Cost rate" value={`${formatMoney(person.costRate)}${person.costRate != null ? "/hr" : ""}`} />
              <ProfileRow label="Bill rate" value={`${formatMoney(person.billRate)}${person.billRate != null ? "/hr" : ""}`} />
              <ProfileRow label="Implied margin" value={margin != null ? `${margin}%` : "—"} />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocation by week</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byWeek.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([week, hrs]) => (
                  <TableRow key={week}>
                    <TableCell>
                      {weekLabel(week)}
                      {week === today && (
                        <Badge variant="secondary" className="ml-2">
                          Current
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{hrs}h</TableCell>
                    <TableCell>
                      {hrs > capacity ? (
                        <Badge variant="over">Over-booked</Badge>
                      ) : hrs === capacity ? (
                        <Badge variant="ok">Full</Badge>
                      ) : (
                        <Badge variant="secondary">{capacity - hrs}h free</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              {byWeek.size === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-[var(--color-muted-foreground)]">
                    No allocations in this window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current projects</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Allocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentAllocations.map((a) => (
                  <TableRow key={a.allocationId}>
                    <TableCell>{a.project?.clientName ?? "—"}</TableCell>
                    <TableCell>{a.project?.projectName ?? "Unknown project"}</TableCell>
                    <TableCell>{a.hours}h</TableCell>
                  </TableRow>
                ))}
                {currentAllocations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-[var(--color-muted-foreground)]">
                      Not allocated this week.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Direct reports</CardTitle>
          </CardHeader>
          <CardContent>
            {directReports.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">No direct reports.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {directReports.map((r) => (
                  <li key={r.personId}>
                    <Link to={`/people/${r.personId}`} className="hover:underline">
                      {r.displayName}
                    </Link>
                    <span className="text-[var(--color-muted-foreground)]"> {r.rank ? `· ${r.rank}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
