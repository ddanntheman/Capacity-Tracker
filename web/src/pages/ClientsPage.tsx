import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineInput } from "@/components/InlineEdit";
import { matchesSearch, useSearchText, useUrlFilters } from "@/lib/urlFilters";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[a.length];
}

function likelyDuplicates(clients: Client[]): [Client, Client][] {
  const pairs: [Client, Client][] = [];
  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const a = normalizeName(clients[i].name);
      const b = normalizeName(clients[j].name);
      if (a.length < 4 || b.length < 4) continue;
      if (a === b || a.startsWith(b) || b.startsWith(a) || editDistance(a, b) <= 2) {
        pairs.push([clients[i], clients[j]]);
      }
    }
  }
  return pairs;
}

export default function ClientsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const isLeadership = hasRole("leadership");
  const qc = useQueryClient();
  const [mergeSource, setMergeSource] = useState<Client | null>(null);

  const filters = useUrlFilters({ q: "", industry: "all" });
  const search = useSearchText(filters);
  const q = search.text;
  const industryFilter = filters.get("industry");

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });
  const projectsQuery = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false) });

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientsQuery.data ?? []) if (c.industry) set.add(c.industry);
    return [...set].sort();
  }, [clientsQuery.data]);

  const clients = useMemo(
    () =>
      (clientsQuery.data ?? []).filter(
        (c) =>
          matchesSearch(q, c.name, c.industry, c.relationshipPartner) &&
          (industryFilter === "all" || c.industry === industryFilter),
      ),
    [clientsQuery.data, q, industryFilter],
  );

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

  const inlineUpdate = useMutation({
    mutationFn: ({ client, patch }: { client: Client; patch: Partial<Client> }) => {
      const merged = { ...client, ...patch };
      return api.updateClient(client.clientId, {
        name: merged.name,
        industry: merged.industry,
        relationshipPartner: merged.relationshipPartner,
        notes: merged.notes,
      });
    },
    onSuccess: () => {
      toast.success("Client updated");
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "A client with that name already exists" : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteClient(id),
    onSuccess: () => {
      toast.success("Client deleted");
      void qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.status === 409 ? "Client has projects — merge it into another client instead" : "Failed to delete",
      ),
  });

  const hasDealValues = (projectsQuery.data ?? []).some((p) => p.dealValue != null);

  const duplicatePairs = useMemo(() => likelyDuplicates(clientsQuery.data ?? []), [clientsQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Client accounts and their engagements. Click a client for details.
          </p>
        </div>
        {canEdit && <CreateClientDialog />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search client, industry, partner…"
          value={search.text}
          onChange={(e) => search.onChange(e.target.value)}
          className="w-64"
        />
        <Select value={industryFilter} onValueChange={(v) => filters.set("industry", v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {industries.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLeadership && duplicatePairs.length > 0 && (
        <div className="rounded-lg border border-[var(--color-warn,#eab308)]/40 bg-[var(--color-warn,#eab308)]/10 p-4">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> Possible duplicate clients
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Similar names split allocations and rollups across records. Review and merge if they're the same client.
          </p>
          <ul className="mt-2 space-y-1">
            {duplicatePairs.map(([a, b]) => (
              <li key={`${a.clientId}-${b.clientId}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{a.name}</span> ↔ <span className="font-medium">{b.name}</span>
                <Button variant="outline" size="sm" onClick={() => setMergeSource(b)}>
                  Merge
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => {
                const r = rollup.get(c.name) ?? { active: 0, pipeline: 0, closed: 0, dealValue: 0 };
                const projectCount = r.active + r.pipeline + r.closed;
                return (
                  <TableRow key={c.clientId}>
                    <TableCell className="font-medium">
                      <Link to={`/clients/${c.clientId}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <InlineInput
                        value={c.industry ?? ""}
                        display={c.industry ?? "—"}
                        disabled={!canEdit}
                        onSave={(v) => inlineUpdate.mutate({ client: c, patch: { industry: v.trim() || null } })}
                      />
                    </TableCell>
                    <TableCell>
                      <InlineInput
                        value={c.relationshipPartner ?? ""}
                        display={c.relationshipPartner ?? "—"}
                        disabled={!canEdit}
                        onSave={(v) => inlineUpdate.mutate({ client: c, patch: { relationshipPartner: v.trim() || null } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">{r.active}</TableCell>
                    <TableCell className="text-right">{r.pipeline}</TableCell>
                    <TableCell className="text-right">{r.closed}</TableCell>
                    {hasDealValues && (
                      <TableCell className="text-right">{r.dealValue > 0 ? `$${r.dealValue.toLocaleString()}` : "—"}</TableCell>
                    )}
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {isLeadership && (
                            <Button variant="outline" size="sm" onClick={() => setMergeSource(c)}>
                              Merge
                            </Button>
                          )}
                          {isLeadership && projectCount === 0 && (
                            <Button variant="outline" size="sm" onClick={() => remove.mutate(c.clientId)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6 + (hasDealValues ? 1 : 0) + (canEdit ? 1 : 0)}
                    className="text-center text-[var(--color-muted-foreground)]"
                  >
                    No clients match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {mergeSource && (
        <MergeClientDialog
          source={mergeSource}
          targets={(clientsQuery.data ?? []).filter((c) => c.clientId !== mergeSource.clientId)}
          onClose={() => setMergeSource(null)}
          onMerged={() => {
            setMergeSource(null);
            void qc.invalidateQueries({ queryKey: ["clients"] });
            void qc.invalidateQueries({ queryKey: ["projects"] });
          }}
        />
      )}
    </div>
  );
}

function CreateClientDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [relationshipPartner, setRelationshipPartner] = useState("");
  const [notes, setNotes] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.createClient({
        name: name.trim(),
        industry: industry.trim() || null,
        relationshipPartner: relationshipPartner.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Client created");
      void qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setName("");
      setIndustry("");
      setRelationshipPartner("");
      setNotes("");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "A client with that name already exists" : "Failed to create client"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Name</Label>
            <Input id="clientName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientIndustry">Industry</Label>
            <Input id="clientIndustry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientPartner">Relationship partner</Label>
            <Input id="clientPartner" value={relationshipPartner} onChange={(e) => setRelationshipPartner(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clientNotes">Notes</Label>
            <Input id="clientNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeClientDialog({
  source,
  targets,
  onClose,
  onMerged,
}: {
  source: Client;
  targets: Client[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState("");

  const merge = useMutation({
    mutationFn: () => api.mergeClient(source.clientId, targetId),
    onSuccess: () => {
      toast.success("Clients merged");
      onMerged();
    },
    onError: () => toast.error("Failed to merge clients"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge “{source.name}”</DialogTitle>
          <DialogDescription>
            All of {source.name}'s projects move to the client you pick, its details fill in any blanks there, and
            this record is deleted. Use this to combine duplicate client rows. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Merge into</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select client to keep" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.clientId} value={t.clientId}>
                  {t.name}
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
