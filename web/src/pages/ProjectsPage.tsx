import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { Project, ProjectStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineInput, InlineSelect } from "@/components/InlineEdit";

const statusVariant: Record<ProjectStatus, "ok" | "warn" | "secondary"> = {
  active: "ok",
  pipeline: "warn",
  closed: "secondary",
};

export default function ProjectsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const isLeadership = hasRole("leadership");
  const qc = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients() });

  const clientIdByName = useMemo(() => new Map(clients.map((c) => [c.name, c.clientId])), [clients]);

  const inlineUpdate = useMutation({
    mutationFn: ({ project, patch }: { project: Project; patch: Partial<Project> }) => {
      const merged = { ...project, ...patch };
      return api.updateProject(project.projectId, {
        clientName: merged.clientName,
        projectName: merged.projectName,
        startDate: merged.startDate,
        endDate: merged.endDate,
        status: merged.status,
        dealValue: merged.dealValue,
        winProbability: merged.winProbability,
        engagementType: merged.engagementType,
        deliveryLeadId: merged.deliveryLeadId,
        notes: merged.notes,
      });
    },
    onSuccess: () => {
      toast.success("Project updated");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: () => toast.error("Failed to update"),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.archiveProject(id),
    onSuccess: () => {
      toast.success("Project archived");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.error("Failed to archive"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Active and pipeline engagements drive the allocation picker.</p>
        </div>
        {canEdit && <ProjectDialog />}
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  {isLeadership && <TableHead className="text-right">Deal value</TableHead>}
                  <TableHead className="text-right">Win %</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.projectId}>
                    <TableCell className="font-medium">
                      {clientIdByName.has(p.clientName) ? (
                        <Link to={`/clients/${clientIdByName.get(p.clientName)}`} className="hover:underline">
                          {p.clientName}
                        </Link>
                      ) : (
                        p.clientName
                      )}
                    </TableCell>
                    <TableCell>{p.projectName}</TableCell>
                    <TableCell>{p.engagementType ?? "—"}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate ?? "—"}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <InlineSelect
                          value={p.status}
                          display={p.status}
                          className="capitalize"
                          options={[
                            { value: "active", label: "Active" },
                            { value: "pipeline", label: "Pipeline" },
                            { value: "closed", label: "Closed" },
                          ]}
                          onSave={(v) => inlineUpdate.mutate({ project: p, patch: { status: v as ProjectStatus } })}
                        />
                      ) : (
                        <Badge variant={statusVariant[p.status]} className="capitalize">
                          {p.status}
                        </Badge>
                      )}
                    </TableCell>
                    {isLeadership && (
                      <TableCell className="text-right">
                        <InlineInput
                          type="number"
                          min={0}
                          value={p.dealValue != null ? String(p.dealValue) : ""}
                          display={p.dealValue != null ? `$${p.dealValue.toLocaleString()}` : "—"}
                          disabled={!canEdit}
                          className="justify-end"
                          inputClassName="text-right"
                          onSave={(v) => inlineUpdate.mutate({ project: p, patch: { dealValue: v === "" ? null : Number(v) } })}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        max={100}
                        value={p.winProbability != null ? String(p.winProbability) : ""}
                        display={p.winProbability != null ? `${p.winProbability}%` : "—"}
                        disabled={!canEdit}
                        className="justify-end"
                        inputClassName="text-right"
                        onSave={(v) =>
                          inlineUpdate.mutate({
                            project: p,
                            patch: { winProbability: v === "" ? null : Math.max(0, Math.min(100, Number(v))) },
                          })
                        }
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <ProjectDialog project={p} />
                          {p.status !== "closed" && (
                            <Button variant="outline" size="sm" onClick={() => archive.mutate(p.projectId)}>
                              Archive
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {projects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7 + (isLeadership ? 1 : 0) + (canEdit ? 1 : 0)} className="text-center text-[var(--color-muted-foreground)]">
                      No projects yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectDialog({ project }: { project?: Project }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState(project?.clientName ?? "");
  const [projectName, setProjectName] = useState(project?.projectName ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "pipeline");
  const [dealValue, setDealValue] = useState(project?.dealValue != null ? String(project.dealValue) : "");
  const [winProbability, setWinProbability] = useState(project?.winProbability != null ? String(project.winProbability) : "");
  const [engagementType, setEngagementType] = useState(project?.engagementType ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        clientName,
        projectName,
        startDate,
        endDate: endDate || null,
        status,
        dealValue: dealValue === "" ? null : Number(dealValue),
        winProbability: winProbability === "" ? null : Math.max(0, Math.min(100, Number(winProbability))),
        engagementType: engagementType || null,
        deliveryLeadId: project?.deliveryLeadId ?? null,
        notes: notes || null,
      };
      return project ? api.updateProject(project.projectId, body) : api.createProject(body);
    },
    onSuccess: () => {
      toast.success(project ? "Project updated" : "Project created");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? "Check the form fields" : "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {project ? (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "Add project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="client">Client name</Label>
            <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project">Project name</Label>
            <Input id="project" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Start date</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">End date</Label>
              <Input id="end" type="date" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pipeline">Pipeline</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dealValue">Deal value ($)</Label>
              <Input id="dealValue" type="number" min={0} value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="winProb">Win probability (%)</Label>
              <Input id="winProb" type="number" min={0} max={100} value={winProbability} onChange={(e) => setWinProbability(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Engagement type</Label>
            <Select value={engagementType || "none"} onValueChange={(v) => setEngagementType(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="T&M">Time &amp; materials</SelectItem>
                <SelectItem value="Fixed fee">Fixed fee</SelectItem>
                <SelectItem value="Milestone">Milestone</SelectItem>
                <SelectItem value="Retainer">Retainer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projNotes">Notes</Label>
            <textarea
              id="projNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!clientName || !projectName || !startDate || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
