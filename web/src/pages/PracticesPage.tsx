import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { Practice } from "@/lib/types";
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
                      <InlineInput
                        value={p.name}
                        display={p.name}
                        disabled={!canEdit}
                        onSave={(v) => v.trim() && update.mutate({ practice: p, patch: { name: v.trim() } })}
                      />
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
