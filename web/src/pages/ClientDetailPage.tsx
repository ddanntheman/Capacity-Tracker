import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { mondayOf } from "@/lib/weeks";
import type { Client, ProjectStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const WEEKS_PER_YEAR = 52;

const statusVariant: Record<ProjectStatus, "ok" | "warn" | "secondary"> = {
  active: "ok",
  pipeline: "warn",
  closed: "secondary",
};

export default function ClientDetailPage() {
  const { id = "" } = useParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const isLeadership = hasRole("leadership");

  const detail = useQuery({ queryKey: ["clients", id], queryFn: () => api.getClient(id) });

  const year = new Date().getFullYear();
  const firstMonday = mondayOf(new Date(year, 0, 7));
  const allocationsQuery = useQuery({
    queryKey: ["allocations", firstMonday, WEEKS_PER_YEAR],
    queryFn: () => api.listAllocations(firstMonday, WEEKS_PER_YEAR),
  });
  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });

  const client = detail.data?.client;
  const projects = useMemo(() => detail.data?.projects ?? [], [detail.data?.projects]);

  const projectIds = useMemo(() => new Set(projects.map((p) => p.projectId)), [projects]);
  const hoursByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocationsQuery.data ?? []) {
      if (!projectIds.has(a.projectId)) continue;
      m.set(a.projectId, (m.get(a.projectId) ?? 0) + a.hours);
    }
    return m;
  }, [allocationsQuery.data, projectIds]);

  const team = useMemo(() => {
    const byPerson = new Map<string, number>();
    for (const a of allocationsQuery.data ?? []) {
      if (!projectIds.has(a.projectId)) continue;
      byPerson.set(a.personId, (byPerson.get(a.personId) ?? 0) + a.hours);
    }
    const people = new Map((peopleQuery.data ?? []).map((p) => [p.personId, p]));
    return [...byPerson.entries()]
      .map(([personId, hours]) => ({ person: people.get(personId), personId, hours }))
      .filter((t) => t.person)
      .sort((a, b) => b.hours - a.hours);
  }, [allocationsQuery.data, projectIds, peopleQuery.data]);

  const totals = useMemo(() => {
    let committed = 0;
    let pipeline = 0;
    let dealValue = 0;
    for (const p of projects) {
      const hours = hoursByProject.get(p.projectId) ?? 0;
      if (p.status === "pipeline") pipeline += hours;
      else if (p.status === "active") committed += hours;
      dealValue += p.dealValue ?? 0;
    }
    return { committed, pipeline, dealValue };
  }, [projects, hoursByProject]);

  if (detail.isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;
  }
  if (!client) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Client not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-[var(--color-muted-foreground)]">
            <Link to="/clients" className="hover:underline">
              Clients
            </Link>{" "}
            / {client.name}
          </div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {[client.industry, client.relationshipPartner && `Partner: ${client.relationshipPartner}`]
              .filter(Boolean)
              .join(" · ") || "No client details recorded yet."}
          </p>
        </div>
        {canEdit && <EditClientDialog client={client} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Engagements" value={`${projects.length}`} description={`${projects.filter((p) => p.status === "active").length} active · ${projects.filter((p) => p.status === "pipeline").length} pipeline`} />
        <SummaryCard title="Committed hrs" value={`${totals.committed}`} description={`${year} staffed hours on active work`} />
        <SummaryCard title="Pipeline hrs" value={`${totals.pipeline}`} description={`${year} soft-booked hours`} />
        {isLeadership && (
          <SummaryCard
            title="Deal value"
            value={totals.dealValue > 0 ? `$${totals.dealValue.toLocaleString()}` : "—"}
            description="Total across engagements"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagements</CardTitle>
          <CardDescription>All projects for this client, with staffed hours for {year}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  {isLeadership && <TableHead className="text-right">Deal value</TableHead>}
                  <TableHead className="text-right">Win %</TableHead>
                  <TableHead className="text-right">Staffed hrs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.projectId}>
                    <TableCell className="font-medium">{p.projectName}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[p.status]} className="capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.engagementType ?? "—"}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate ?? "—"}</TableCell>
                    {isLeadership && (
                      <TableCell className="text-right">{p.dealValue != null ? `$${p.dealValue.toLocaleString()}` : "—"}</TableCell>
                    )}
                    <TableCell className="text-right">{p.winProbability != null ? `${p.winProbability}%` : "—"}</TableCell>
                    <TableCell className="text-right">{hoursByProject.get(p.projectId) ?? 0}</TableCell>
                  </TableRow>
                ))}
                {projects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isLeadership ? 8 : 7} className="text-center text-[var(--color-muted-foreground)]">
                      No engagements for this client yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staffed team</CardTitle>
            <CardDescription>People allocated to this client in {year}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((t) => (
                  <TableRow key={t.personId}>
                    <TableCell className="font-medium">
                      <Link to={`/people/${t.personId}`} className="hover:underline">
                        {t.person!.displayName}
                      </Link>
                    </TableCell>
                    <TableCell>{t.person!.rank ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.hours}</TableCell>
                  </TableRow>
                ))}
                {team.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-[var(--color-muted-foreground)]">
                      Nobody staffed yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
            <CardDescription>Relationship and engagement context.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{client.notes || "No notes yet."}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>
      </CardContent>
    </Card>
  );
}

function EditClientDialog({ client }: { client: Client }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [industry, setIndustry] = useState(client.industry ?? "");
  const [relationshipPartner, setRelationshipPartner] = useState(client.relationshipPartner ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      api.updateClient(client.clientId, {
        name,
        industry: industry || null,
        relationshipPartner: relationshipPartner || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      toast.success("Client updated");
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
    },
    onError: () => toast.error("Failed to save client"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="partner">Relationship partner</Label>
            <Input id="partner" value={relationshipPartner} onChange={(e) => setRelationshipPartner(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
