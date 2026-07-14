import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { currentWeekStart, shiftWeeks, weekLabel } from "@/lib/weeks";
import { capacityForWeek, holidaysInWeek } from "@/lib/holidays";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonDialog } from "@/pages/PeoplePage";

const LOOKBACK_WEEKS = 8;
const LOOKAHEAD_WEEKS = 4;
const FORECAST_MAX_WEEKS = 52;

export default function PersonProfilePage() {
  const { id = "" } = useParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");

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
  const forecastStart = currentWeekStart();
  const { data: forecastAllocations = [] } = useQuery({
    queryKey: ["allocations", "forecast", id, forecastStart, FORECAST_MAX_WEEKS],
    queryFn: () => api.listAllocations(forecastStart, FORECAST_MAX_WEEKS, id),
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

  const parseTags = (value: string | null) =>
    (value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const skills = parseTags(person.skills);
  const certifications = parseTags(person.certifications);
  const industryExperience = parseTags(person.industryExperience);

  const today = currentWeekStart();
  const byWeek = new Map<string, number>();
  for (const a of allocations) {
    byWeek.set(a.weekStart, (byWeek.get(a.weekStart) ?? 0) + a.hours);
  }
  const capacity = person.weeklyCapacityHours || 40;
  const pastWeeks = [...byWeek.entries()].filter(([w]) => w <= today);
  const pastCapacity = pastWeeks.reduce((sum, [w]) => sum + capacityForWeek(w, capacity), 0);
  const actualUtilization =
    pastWeeks.length > 0 && pastCapacity > 0
      ? Math.round((pastWeeks.reduce((sum, [, hrs]) => sum + hrs, 0) / pastCapacity) * 100)
      : null;
  const currentWeekTotal = byWeek.get(today) ?? 0;

  const currentAllocations = allocations
    .filter((a) => a.weekStart === today)
    .map((a) => ({
      ...a,
      project: projects.find((p) => p.projectId === a.projectId),
    }));

  // Forecast horizon runs from the current week to the furthest week that has any
  // committed or pipeline work (variable, not a fixed quarter).
  const projectStatusById = new Map(projects.map((p) => [p.projectId, p.status]));
  let horizonEnd = today;
  let committedHours = 0;
  let pipelineHours = 0;
  let hasForecastWork = false;
  for (const a of forecastAllocations) {
    if (a.weekStart < today) continue;
    const status = projectStatusById.get(a.projectId);
    if (!status || status === "closed") continue;
    hasForecastWork = true;
    if (a.weekStart > horizonEnd) horizonEnd = a.weekStart;
    if (status === "pipeline") pipelineHours += a.hours;
    else committedHours += a.hours;
  }
  const horizonWeeks = hasForecastWork
    ? Math.round((new Date(horizonEnd).getTime() - new Date(today).getTime()) / (7 * 24 * 3600 * 1000)) + 1
    : 0;
  let forecastCapacity = 0;
  for (let i = 0; i < horizonWeeks; i++) {
    forecastCapacity += capacityForWeek(shiftWeeks(today, i), capacity);
  }
  const forecastHours = committedHours + pipelineHours;
  const forecastUtil = forecastCapacity > 0 ? Math.round((forecastHours / forecastCapacity) * 100) : null;
  const targetBillableHours =
    person.utilizationTarget != null ? Math.round((person.utilizationTarget / 100) * forecastCapacity) : null;
  const onTrack =
    person.utilizationTarget != null && forecastUtil != null ? forecastUtil >= person.utilizationTarget : null;

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact & details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ProfileRow label="Email" value={person.email} />
            <ProfileRow label="Phone" value={person.phone ?? "—"} />
            <ProfileRow label="Location" value={person.location ?? "—"} />
            <ProfileRow label="Start date" value={person.startDate ?? "—"} />
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {skills.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            {certifications.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[var(--color-muted-foreground)]">Certifications</span>
                <div className="flex flex-wrap gap-1">
                  {certifications.map((c) => (
                    <Badge key={c} variant="secondary">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {industryExperience.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[var(--color-muted-foreground)]">Industry experience</span>
                <div className="flex flex-wrap gap-1">
                  {industryExperience.map((i) => (
                    <Badge key={i} variant="secondary">
                      {i}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {person.staffingPreferences && (
              <ProfileRow label="Staffing preferences" value={person.staffingPreferences} />
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

      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forecast</CardTitle>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {horizonWeeks > 0
              ? `Committed + pipeline over the next ${horizonWeeks} ${horizonWeeks === 1 ? "week" : "weeks"} (through ${weekLabel(horizonEnd)}).`
              : "No committed or pipeline work booked ahead."}
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ProfileRow label="Committed hrs" value={`${committedHours} hrs`} />
          <ProfileRow label="Pipeline hrs" value={`${pipelineHours} hrs`} />
          <ProfileRow label="Forecast billable hrs" value={`${forecastHours} hrs`} />
          <ProfileRow
            label="Target billable hrs"
            value={targetBillableHours != null ? `${targetBillableHours} hrs` : "—"}
          />
          <ProfileRow label="Forecast utilization" value={forecastUtil != null ? `${forecastUtil}%` : "—"} />
          {onTrack != null && (
            <div className="pt-1">
              {onTrack ? (
                <Badge variant="ok">On track vs target ({person.utilizationTarget}%)</Badge>
              ) : (
                <Badge variant="over">
                  {(person.utilizationTarget ?? 0) - (forecastUtil ?? 0)}% below target ({person.utilizationTarget}%)
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
                .map(([week, hrs]) => {
                  const weekCapacity = capacityForWeek(week, capacity);
                  return (
                    <TableRow key={week}>
                      <TableCell>
                        {weekLabel(week)}
                        {week === today && (
                          <Badge variant="secondary" className="ml-2">
                            Current
                          </Badge>
                        )}
                        {holidaysInWeek(week) > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            Holiday ({weekCapacity}h cap)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{hrs}h</TableCell>
                      <TableCell>
                        {hrs > weekCapacity ? (
                          <Badge variant="over">Over-booked</Badge>
                        ) : hrs === weekCapacity ? (
                          <Badge variant="ok">Full</Badge>
                        ) : (
                          <Badge variant="secondary">{weekCapacity - hrs}h free</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      <div>
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
