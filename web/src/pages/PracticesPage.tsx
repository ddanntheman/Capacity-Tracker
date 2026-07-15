import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { Practice, StandardRank } from "@/lib/types";
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

export default function PracticesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const qc = useQueryClient();
  const [merging, setMerging] = useState<Practice | null>(null);

  const filters = useUrlFilters({ q: "", status: "all" });
  const search = useSearchText(filters);
  const q = search.text;
  const statusFilter = filters.get("status");

  const { data: allPractices = [], isLoading } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });
  const { data: people = [] } = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });

  const practices = allPractices.filter(
    (p) =>
      matchesSearch(q, p.name) &&
      (statusFilter === "all" || (statusFilter === "archived" ? p.isArchived : !p.isArchived)),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["practices"] });
    void qc.invalidateQueries({ queryKey: ["people"] });
  };

  const update = useMutation({
    mutationFn: ({ practice, patch }: { practice: Practice; patch: Partial<Practice> }) =>
      api.updatePractice(practice.practiceId, {
        name: patch.name ?? practice.name,
        leadId: patch.leadId !== undefined ? patch.leadId : practice.leadId,
        defaultUtilizationTarget:
          patch.defaultUtilizationTarget !== undefined ? patch.defaultUtilizationTarget : practice.defaultUtilizationTarget,
        isArchived: patch.isArchived ?? practice.isArchived,
      }),
    onSuccess: () => {
      toast.success("Practice updated");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "A practice with that name already exists" : "Failed to update practice"),
  });

  const leadName = (id: string | null) => people.find((p) => p.personId === id)?.displayName ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Practices</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Manage practices. Renaming updates everyone in the practice. Click a value to edit inline.
          </p>
        </div>
        {canEdit && <CreatePracticeDialog />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search practice…" value={search.text} onChange={(e) => search.onChange(e.target.value)} className="w-56" />
        <Select value={statusFilter} onValueChange={(v) => filters.set("status", v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
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
                  <TableHead>Lead</TableHead>
                  <TableHead className="text-right">Default target %</TableHead>
                  <TableHead className="text-right">Headcount</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {practices.map((p) => (
                  <TableRow key={p.practiceId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        <InlineInput
                          value={p.name}
                          display={p.name}
                          disabled={!canEdit}
                          onSave={(v) => v.trim() && update.mutate({ practice: p, patch: { name: v.trim() } })}
                        />
                        <Link
                          to={`/practices/${p.practiceId}`}
                          className="shrink-0 text-xs text-[var(--color-muted-foreground)] hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <InlineSelect
                        value={p.leadId ?? ""}
                        display={leadName(p.leadId)}
                        disabled={!canEdit}
                        allowNone
                        noneLabel="No lead"
                        options={people.map((m) => ({ value: m.personId, label: m.displayName }))}
                        onSave={(v) => update.mutate({ practice: p, patch: { leadId: v || null } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        max={100}
                        value={p.defaultUtilizationTarget != null ? String(p.defaultUtilizationTarget) : ""}
                        display={p.defaultUtilizationTarget != null ? `${p.defaultUtilizationTarget}%` : "—"}
                        disabled={!canEdit}
                        className="justify-end"
                        inputClassName="text-right"
                        onSave={(v) =>
                          update.mutate({ practice: p, patch: { defaultUtilizationTarget: v === "" ? null : Number(v) } })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.headcount}</TableCell>
                    <TableCell>
                      {p.isArchived ? <Badge variant="secondary">Archived</Badge> : <Badge variant="ok">Active</Badge>}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setMerging(p)}>
                            Merge into…
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => update.mutate({ practice: p, patch: { isArchived: !p.isArchived } })}
                          >
                            {p.isArchived ? "Restore" : "Archive"}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {practices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-[var(--color-muted-foreground)]">
                      No practices yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StandardRanksCard />

      {merging && (
        <MergePracticeDialog
          source={merging}
          targets={practices.filter((p) => p.practiceId !== merging.practiceId)}
          onClose={() => setMerging(null)}
          onMerged={() => {
            setMerging(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function StandardRanksCard() {
  const { hasRole } = useAuth();
  const isLeadership = hasRole("leadership");
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const { data: ranks = [], isLoading } = useQuery({ queryKey: ["ranks"], queryFn: api.listRanks });
  const sorted = [...ranks].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["ranks"] });

  const update = useMutation({
    mutationFn: ({ rank, patch }: { rank: StandardRank; patch: Partial<StandardRank> }) =>
      api.updateRank(rank.standardRankId, {
        name: patch.name ?? rank.name,
        sortOrder: patch.sortOrder ?? rank.sortOrder,
        defaultUtilizationTarget:
          patch.defaultUtilizationTarget !== undefined ? patch.defaultUtilizationTarget : rank.defaultUtilizationTarget,
        isArchived: patch.isArchived ?? rank.isArchived,
      }),
    onSuccess: () => {
      toast.success("Rank updated");
      invalidate();
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "A rank with that name already exists" : "Failed to update rank"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createRank({ name: newName.trim(), defaultUtilizationTarget: newTarget === "" ? null : Number(newTarget) }),
    onSuccess: () => {
      toast.success("Rank added");
      setNewName("");
      setNewTarget("");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "A rank with that name already exists" : "Failed to add rank"),
  });

  const remove = useMutation({
    mutationFn: (rank: StandardRank) => api.deleteRank(rank.standardRankId),
    onSuccess: () => {
      toast.success("Rank deleted");
      invalidate();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to delete rank");
    },
  });

  const move = (rank: StandardRank, dir: -1 | 1) => {
    const idx = sorted.findIndex((r) => r.standardRankId === rank.standardRankId);
    const other = sorted[idx + dir];
    if (!other) return;
    update.mutate({ rank, patch: { sortOrder: other.sortOrder } });
    update.mutate({ rank: other, patch: { sortOrder: rank.sortOrder } });
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Standard ranks</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          The firm's rank ladder used across people, pricing plans, and rate cards.
          {isLeadership ? " Renaming a rank updates everyone at that rank." : " Only leadership can change ranks."}
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Order</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead className="text-right">Default target %</TableHead>
                  <TableHead className="text-right">Headcount</TableHead>
                  <TableHead>Status</TableHead>
                  {isLeadership && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, i) => (
                  <TableRow key={r.standardRankId}>
                    <TableCell>
                      {isLeadership ? (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-6" disabled={i === 0} onClick={() => move(r, -1)} aria-label={`Move ${r.name} up`}>
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6" disabled={i === sorted.length - 1} onClick={() => move(r, 1)} aria-label={`Move ${r.name} down`}>
                            <ArrowDown className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="tabular-nums">{i + 1}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <InlineInput
                        value={r.name}
                        display={r.name}
                        disabled={!isLeadership}
                        onSave={(v) => v.trim() && update.mutate({ rank: r, patch: { name: v.trim() } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        max={100}
                        value={r.defaultUtilizationTarget != null ? String(r.defaultUtilizationTarget) : ""}
                        display={r.defaultUtilizationTarget != null ? `${r.defaultUtilizationTarget}%` : "—"}
                        disabled={!isLeadership}
                        className="justify-end"
                        inputClassName="text-right"
                        onSave={(v) =>
                          update.mutate({ rank: r, patch: { defaultUtilizationTarget: v === "" ? null : Number(v) } })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.headcount}</TableCell>
                    <TableCell>
                      {r.isArchived ? <Badge variant="secondary">Archived</Badge> : <Badge variant="ok">Active</Badge>}
                    </TableCell>
                    {isLeadership && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => update.mutate({ rank: r, patch: { isArchived: !r.isArchived } })}
                          >
                            {r.isArchived ? "Restore" : "Archive"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={r.headcount > 0}
                            onClick={() => remove.mutate(r)}
                            aria-label={`Delete ${r.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isLeadership ? 6 : 5} className="text-center text-[var(--color-muted-foreground)]">
                      No ranks defined yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {isLeadership && (
            <form
              className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) create.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="newRankName">New rank</Label>
                <Input id="newRankName" className="w-56" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newRankTarget">Default target (%)</Label>
                <Input
                  id="newRankTarget"
                  className="w-36"
                  type="number"
                  min={0}
                  max={100}
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={!newName.trim() || create.isPending}>
                <Plus className="size-4" /> Add rank
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreatePracticeDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createPractice({ name: name.trim(), leadId: null, defaultUtilizationTarget: target === "" ? null : Number(target) }),
    onSuccess: () => {
      toast.success("Practice created");
      void qc.invalidateQueries({ queryKey: ["practices"] });
      setName("");
      setTarget("");
      setOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "A practice with that name already exists" : "Failed to create practice"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add practice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add practice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="practiceName">Name</Label>
            <Input id="practiceName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="practiceTarget">Default utilization target (%)</Label>
            <Input id="practiceTarget" type="number" min={0} max={100} value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergePracticeDialog({
  source,
  targets,
  onClose,
  onMerged,
}: {
  source: Practice;
  targets: Practice[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState("");

  const merge = useMutation({
    mutationFn: () => api.mergePractice(source.practiceId, targetId),
    onSuccess: () => {
      toast.success("Practices merged");
      onMerged();
    },
    onError: () => toast.error("Failed to merge practices"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge “{source.name}”</DialogTitle>
          <DialogDescription>
            Everyone in {source.name} ({source.headcount} {source.headcount === 1 ? "person" : "people"}) moves to the target
            practice, and {source.name} is deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Merge into</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select target practice" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.practiceId} value={t.practiceId}>
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
