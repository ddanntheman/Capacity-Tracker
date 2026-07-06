import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ClientsPage() {
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });

  const rollup = useMemo(() => {
    const m = new Map<string, { active: number; pipeline: number; closed: number; dealValue: number }>();
    for (const p of projectsQuery.data ?? []) {
      if (!m.has(p.clientName)) m.set(p.clientName, { active: 0, pipeline: 0, closed: 0, dealValue: 0 });
      const r = m.get(p.clientName)!;
      r[p.status] += 1;
      r.dealValue += p.dealValue ?? 0;
    }
    return m;
  }, [projectsQuery.data]);

  const hasDealValues = (projectsQuery.data ?? []).some((p) => p.dealValue != null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Client accounts and their engagements. Click a client for details.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Relationship partner</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Pipeline</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                {hasDealValues && <TableHead className="text-right">Deal value</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(clientsQuery.data ?? []).map((c) => {
                const r = rollup.get(c.name) ?? { active: 0, pipeline: 0, closed: 0, dealValue: 0 };
                return (
                  <TableRow key={c.clientId}>
                    <TableCell className="font-medium">
                      <Link to={`/clients/${c.clientId}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>{c.industry ?? "—"}</TableCell>
                    <TableCell>{c.relationshipPartner ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.active}</TableCell>
                    <TableCell className="text-right">{r.pipeline}</TableCell>
                    <TableCell className="text-right">{r.closed}</TableCell>
                    {hasDealValues && (
                      <TableCell className="text-right">{r.dealValue > 0 ? `$${r.dealValue.toLocaleString()}` : "—"}</TableCell>
                    )}
                  </TableRow>
                );
              })}
              {(clientsQuery.data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={hasDealValues ? 7 : 6} className="text-center text-[var(--color-muted-foreground)]">
                    No clients yet.
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
