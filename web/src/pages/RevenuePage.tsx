import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { mondayOf } from "@/lib/weeks";
import type { Project } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const WEEKS_PER_YEAR = 52;

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function RevenuePage() {
  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });
  const allocationsQuery = useQuery({
    queryKey: ["allocations", firstMonday, WEEKS_PER_YEAR],
    queryFn: () => api.listAllocations(firstMonday, WEEKS_PER_YEAR),
  });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });

  const projects = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projectsQuery.data ?? []) m.set(p.projectId, p);
    return m;
  }, [projectsQuery.data]);

  const clientIdByName = useMemo(
    () => new Map((clientsQuery.data ?? []).map((c) => [c.name, c.clientId])),
    [clientsQuery.data],
  );

  const computeRevenue = () => {
    const rates = new Map<string, { billRate: number | null; costRate: number | null }>();
    for (const p of peopleQuery.data ?? []) rates.set(p.personId, { billRate: p.billRate, costRate: p.costRate });

    type Bucket = { committedRevenue: number; pipelineRevenue: number; weightedPipelineRevenue: number; cost: number };
    const empty = (): Bucket => ({ committedRevenue: 0, pipelineRevenue: 0, weightedPipelineRevenue: 0, cost: 0 });
    const byPerson = new Map<string, Bucket>();
    const byClient = new Map<string, Bucket>();
    const totals = empty();
    let missingRates = 0;
    const missingSeen = new Set<string>();

    for (const a of allocationsQuery.data ?? []) {
      const project = projects.get(a.projectId);
      if (!project || project.status === "closed") continue;
      const r = rates.get(a.personId);
      if (r?.billRate == null) {
        if (!missingSeen.has(a.personId)) {
          missingSeen.add(a.personId);
          missingRates += 1;
        }
        continue;
      }
      const revenue = a.hours * r.billRate;
      const cost = r.costRate != null ? a.hours * r.costRate : 0;
      if (!byPerson.has(a.personId)) byPerson.set(a.personId, empty());
      if (!byClient.has(project.clientName)) byClient.set(project.clientName, empty());
      for (const b of [byPerson.get(a.personId)!, byClient.get(project.clientName)!, totals]) {
        if (project.status === "pipeline") {
          b.pipelineRevenue += revenue;
          b.weightedPipelineRevenue += revenue * ((project.winProbability ?? 100) / 100);
        } else {
          b.committedRevenue += revenue;
          b.cost += cost;
        }
      }
    }

    const peopleById = new Map((peopleQuery.data ?? []).map((p) => [p.personId, p]));
    const personRows = [...byPerson.entries()]
      .map(([personId, b]) => ({ person: peopleById.get(personId), personId, ...b }))
      .filter((r) => r.person)
      .sort((a, b) => b.committedRevenue - a.committedRevenue);
    const clientRows = [...byClient.entries()]
      .map(([clientName, b]) => ({ clientName, ...b }))
      .sort((a, b) => b.committedRevenue - a.committedRevenue);

    return { personRows, clientRows, totals, missingRates };
  };
  const { personRows, clientRows, totals, missingRates } = computeRevenue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Revenue Forecast</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {year} forecast from allocated hours × bill rates. Weighted pipeline applies each engagement's win probability.
          {missingRates > 0 && ` ${missingRates} people have no bill rate and are excluded.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Committed revenue" value={fmt(totals.committedRevenue)} />
        <SummaryCard title="Pipeline revenue" value={fmt(totals.pipelineRevenue)} />
        <SummaryCard title="Weighted pipeline" value={fmt(totals.weightedPipelineRevenue)} />
        <SummaryCard title="Committed margin" value={totals.cost > 0 ? fmt(totals.committedRevenue - totals.cost) : "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By client</CardTitle>
          <CardDescription>Revenue from staffed hours per client.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Pipeline</TableHead>
                <TableHead className="text-right">Weighted pipeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientRows.map((r) => (
                <TableRow key={r.clientName}>
                  <TableCell className="font-medium">
                    {clientIdByName.has(r.clientName) ? (
                      <Link to={`/clients/${clientIdByName.get(r.clientName)}`} className="hover:underline">
                        {r.clientName}
                      </Link>
                    ) : (
                      r.clientName
                    )}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.committedRevenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pipelineRevenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.weightedPipelineRevenue)}</TableCell>
                </TableRow>
              ))}
              {clientRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-[var(--color-muted-foreground)]">
                    No revenue data — set bill rates on people to see forecasts.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By person</CardTitle>
          <CardDescription>Revenue generated by each person's staffed hours.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Pipeline</TableHead>
                <TableHead className="text-right">Weighted pipeline</TableHead>
                <TableHead className="text-right">Committed margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personRows.map((r) => (
                <TableRow key={r.personId}>
                  <TableCell className="font-medium">
                    <Link to={`/people/${r.personId}`} className="hover:underline">
                      {r.person!.displayName}
                    </Link>
                  </TableCell>
                  <TableCell>{r.person!.rank ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(r.committedRevenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pipelineRevenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.weightedPipelineRevenue)}</TableCell>
                  <TableCell className="text-right">{r.cost > 0 ? fmt(r.committedRevenue - r.cost) : "—"}</TableCell>
                </TableRow>
              ))}
              {personRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-[var(--color-muted-foreground)]">
                    No revenue data — set bill rates on people to see forecasts.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
