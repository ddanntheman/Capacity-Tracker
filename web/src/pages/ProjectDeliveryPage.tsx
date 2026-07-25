import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { ChangeOrder, DeliveryLine, ProjectDelivery } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineInput } from "@/components/InlineEdit";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const hrs = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function ProjectDeliveryPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");

  const { data: delivery, isLoading, error } = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => api.getProjectDelivery(id),
    retry: false,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const project = projects.find((p) => p.projectId === id);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["delivery", id] });

  if (isLoading) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;
  if (error || !delivery) {
    return (
      <div className="space-y-2">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:underline">
          <ArrowLeft className="size-3.5" /> Back to project
        </Link>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No pricing plan exists for this engagement yet — delivery tracking starts from a staffed pricing plan.
        </p>
      </div>
    );
  }

  const won = delivery.planStatus === "closedWon";

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/projects/${id}`} className="mb-1 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:underline">
          <ArrowLeft className="size-3.5" /> {project ? `${project.clientName} — ${project.projectName}` : "Back to project"}
        </Link>
        <h1 className="text-2xl font-semibold">Delivery tracking & ETC</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant={won ? "ok" : "outline"}>{delivery.planStatus}</Badge>
          {delivery.actualsStale && (
            <Badge variant="warn">
              <AlertTriangle className="mr-1 size-3" />
              Actuals stale{delivery.lastActualEntryUtc ? ` — last entry ${new Date(delivery.lastActualEntryUtc).toLocaleDateString()}` : " — none entered"}
            </Badge>
          )}
          {won && delivery.zeroRevenueMonths.length > 0 && (
            <Badge variant="warn">
              <AlertTriangle className="mr-1 size-3" />
              Zero recognized revenue: {delivery.zeroRevenueMonths.map((m) => m.slice(0, 7)).join(", ")}
            </Badge>
          )}
          <Link to={`/plans/${delivery.pricingPlanId}`} className="text-sm text-[var(--color-muted-foreground)] hover:underline">
            Open pricing plan
          </Link>
        </div>
      </div>

      <EtcCard delivery={delivery} canEdit={canEdit} onChanged={invalidate} />
      <ActualsCard delivery={delivery} canEdit={canEdit} onChanged={invalidate} />
      <ChangeOrdersCard delivery={delivery} canEdit={canEdit} canApprove={hasRole("leadership")} onChanged={invalidate} />
      <ExpensesCard delivery={delivery} canEdit={canEdit} onChanged={invalidate} />
    </div>
  );
}

/** EAC vs the (change-order-amended) contractual baseline (ETC-01..05). */
function EtcCard({ delivery, canEdit, onChanged }: { delivery: ProjectDelivery; canEdit: boolean; onChanged: () => void }) {
  const { etc } = delivery;
  const [overriding, setOverriding] = useState(false);

  const clearOverride = useMutation({
    mutationFn: () => api.clearEtcOverride(delivery.projectId),
    onSuccess: () => {
      toast.success("ETC override cleared");
      onChanged();
    },
    onError: () => toast.error("Failed to clear override"),
  });

  const overridden = etc.overrideEtcHours != null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">ETC / EAC</CardTitle>
          <CardDescription>EAC = actuals to date + estimate to complete, derived from the staffing grid.</CardDescription>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {overridden && (
              <Button size="sm" variant="outline" onClick={() => clearOverride.mutate()}>
                Clear override
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setOverriding(true)}>
              {overridden ? "Change override" : "Override ETC"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {etc.hoursOverrun && <Badge variant="over">Hour overrun: +{hrs(etc.hoursVariance)}h vs baseline</Badge>}
          {etc.feeOverrun && <Badge variant="over">Fee overrun: +{money(etc.feesVariance)} vs TCV</Badge>}
          {etc.marginErosion && <Badge variant="over">Margin erosion</Badge>}
          {!etc.hoursOverrun && !etc.feeOverrun && !etc.marginErosion && <Badge variant="ok">On track vs contractual position</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Actuals to date" value={`${hrs(etc.actualHours)}h`} sub={money(etc.actualFees)} />
          <Stat
            label={overridden ? "Derived ETC (superseded)" : "ETC (derived)"}
            value={`${hrs(etc.derivedEtcHours)}h`}
            sub={money(etc.derivedEtcFees)}
          />
          {overridden && (
            <Stat
              label="ETC (override in effect)"
              value={`${hrs(etc.overrideEtcHours ?? 0)}h`}
              sub={`${money(etc.overrideEtcFees ?? 0)} · Δ ${hrs((etc.overrideEtcHours ?? 0) - etc.derivedEtcHours)}h vs derived`}
            />
          )}
          <Stat label="EAC" value={`${hrs(etc.eacHours)}h`} sub={`${money(etc.eacFees)}${etc.eacMarginPct != null ? ` · ${etc.eacMarginPct}% margin` : ""}`} />
          <Stat
            label="Contractual baseline"
            value={`${hrs(etc.amendedBaselineHours)}h`}
            sub={`${money(etc.amendedTcv)}${etc.approvedChangeOrderHours || etc.approvedChangeOrderFees ? ` (orig ${hrs(etc.baselineHours)}h / ${money(etc.originalTcv)} + COs)` : ""}`}
          />
        </div>
        {delivery.override && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Override justification: “{delivery.override.justification}” — {delivery.override.createdBy ?? "unknown"},{" "}
            {new Date(delivery.override.createdAtUtc).toLocaleDateString()}
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Hard cost</TableHead>
              <TableHead className="text-right">ETC</TableHead>
              <TableHead className="text-right">EAC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {etc.lines.map((l) => (
              <TableRow key={l.planLineItemId}>
                <TableCell>
                  {l.label}
                  {l.organization === "subcontractor" && <Badge variant="secondary" className="ml-2">Sub</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{hrs(l.forecastHours)}h</TableCell>
                <TableCell className="text-right tabular-nums">{hrs(l.actualHours)}h</TableCell>
                <TableCell className="text-right tabular-nums">{l.actualHardCost ? money(l.actualHardCost) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{hrs(l.etcHours)}h</TableCell>
                <TableCell className="text-right tabular-nums">{hrs(l.eacHours)}h</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {overriding && (
        <OverrideDialog
          projectId={delivery.projectId}
          derivedHours={etc.derivedEtcHours}
          derivedFees={etc.derivedEtcFees}
          onClose={() => setOverriding(false)}
          onSaved={() => {
            setOverriding(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function OverrideDialog({
  projectId,
  derivedHours,
  derivedFees,
  onClose,
  onSaved,
}: {
  projectId: string;
  derivedHours: number;
  derivedFees: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [hours, setHours] = useState(String(derivedHours));
  const [fees, setFees] = useState(String(derivedFees));
  const [justification, setJustification] = useState("");

  const save = useMutation({
    mutationFn: () => api.setEtcOverride(projectId, { hours: Number(hours), fees: Number(fees), justification: justification.trim() }),
    onSuccess: () => {
      toast.success("ETC override set");
      onSaved();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to set override");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manual ETC override</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Derived ETC is {hrs(derivedHours)}h / {money(derivedFees)}. The override replaces it in EAC until cleared.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ETC hours</Label>
              <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ETC fees ($)</Label>
              <Input type="number" min={0} value={fees} onChange={(e) => setFees(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Justification (required)</Label>
            <Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="e.g. Descoped module 3" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!justification.trim() || save.isPending}>
            Set override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Weekly actual hours by resource (DT-02/02a/02b/03). */
function ActualsCard({ delivery, canEdit, onChanged }: { delivery: ProjectDelivery; canEdit: boolean; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const currentWeek = useMemo(() => {
    const d = new Date();
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }, []);

  const weeks = useMemo(() => {
    const all = new Set<string>();
    delivery.lines.forEach((l) => l.weeks.forEach((w) => all.add(w.weekStart)));
    return [...all].sort();
  }, [delivery.lines]);

  const save = useMutation({
    mutationFn: (entry: { planLineItemId: string; weekStart: string; hours: number; hardCost?: number | null }) =>
      api.saveProjectActuals(delivery.projectId, [entry]),
    onSuccess: () => {
      toast.success("Actuals saved");
      onChanged();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to save actuals");
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Actual hours by week</CardTitle>
          <CardDescription>
            Past weeks show actuals where entered (forecast in parentheses); future weeks show the rolling forecast.
            Actuals never overwrite the forecast or the Original Plan.
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setUploading(true)}>
            <Upload className="size-4" /> Upload WIP report
          </Button>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56 sticky left-0 bg-[var(--color-card)]">Resource</TableHead>
              {weeks.map((w) => (
                <TableHead key={w} className={`whitespace-nowrap text-right text-xs ${w === currentWeek ? "font-bold" : ""}`}>
                  {w.slice(5)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {delivery.lines.map((line) => (
              <ActualsRow
                key={line.planLineItemId}
                line={line}
                weeks={weeks}
                currentWeek={currentWeek}
                canEdit={canEdit}
                onSave={(weekStart, hours, hardCost) =>
                  save.mutate({ planLineItemId: line.planLineItemId, weekStart, hours, hardCost })
                }
              />
            ))}
            {delivery.lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={weeks.length + 1} className="text-center text-[var(--color-muted-foreground)]">
                  No delivery-team lines on the pricing plan yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {uploading && (
        <WipDialog
          projectId={delivery.projectId}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function ActualsRow({
  line,
  weeks,
  currentWeek,
  canEdit,
  onSave,
}: {
  line: DeliveryLine;
  weeks: string[];
  currentWeek: string;
  canEdit: boolean;
  onSave: (weekStart: string, hours: number, hardCost: number | null) => void;
}) {
  const byWeek = new Map(line.weeks.map((w) => [w.weekStart, w]));
  const isSub = line.organization === "subcontractor";

  return (
    <TableRow>
      <TableCell className="sticky left-0 bg-[var(--color-card)]">
        <div className="font-medium">{line.label}</div>
        <div className="text-xs text-[var(--color-muted-foreground)]">
          {isSub ? "Subcontractor — enter hours + hard cost" : line.isNamed ? "Named resource" : "Placeholder"}
        </div>
      </TableCell>
      {weeks.map((w) => {
        const cell = byWeek.get(w);
        const forecast = cell?.forecastHours ?? 0;
        const actual = cell?.actualHours ?? null;
        const isPastOrCurrent = w <= currentWeek;
        if (!isPastOrCurrent) {
          return (
            <TableCell key={w} className="text-right text-xs tabular-nums text-[var(--color-muted-foreground)]">
              {forecast ? `${hrs(forecast)}` : "·"}
            </TableCell>
          );
        }
        return (
          <TableCell key={w} className="p-1 text-right">
            <InlineInput
              type="number"
              min={0}
              max={168}
              value={actual != null ? String(actual) : ""}
              display={actual != null ? `${hrs(actual)}` : forecast ? `(${hrs(forecast)})` : "·"}
              disabled={!canEdit}
              className="justify-end"
              inputClassName="w-14 text-right"
              onSave={(v) => {
                if (v === "" && actual == null) return;
                const hardCost = isSub && v !== ""
                  ? Number(window.prompt("Subcontractor hard cost ($) for this week:", String(byWeek.get(w)?.actualHardCost ?? 0)) ?? 0)
                  : null;
                onSave(w, v === "" ? 0 : Number(v), hardCost);
              }}
            />
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function WipDialog({ projectId, onClose, onUploaded }: { projectId: string; onClose: () => void; onUploaded: () => void }) {
  const [csv, setCsv] = useState("");
  const [unmatched, setUnmatched] = useState<string[] | null>(null);

  const upload = useMutation({
    mutationFn: () => api.uploadWipReport(projectId, csv),
    onSuccess: (r) => {
      toast.success(`WIP processed — ${r.matchedRows} row(s) matched, ${r.unmatchedRows} unmatched`);
      if (r.unmatchedRows > 0) {
        setUnmatched(r.unmatched);
      } else {
        onUploaded();
      }
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to process WIP report");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload WIP report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-[var(--color-muted-foreground)]">
            Paste CSV rows: <code>resource,week (YYYY-MM-DD),hours[,hardCost]</code>. Rows match team lines by resource
            name or role title; unmatched rows are listed for review.
          </p>
          <textarea
            className="h-40 w-full rounded-md border border-[var(--color-border)] bg-transparent p-2 font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"Jane Doe,2026-07-06,32\nSub Developer,2026-07-06,40,6000"}
          />
          <div>
            <Label className="text-xs">…or choose a CSV file</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void f.text().then(setCsv);
              }}
            />
          </div>
          {unmatched && (
            <div className="rounded-md border border-[var(--color-warn)] p-2">
              <p className="mb-1 font-medium">Unmatched rows (review and correct):</p>
              <ul className="list-disc pl-5 text-xs">
                {unmatched.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={unmatched ? onUploaded : onClose}>
            {unmatched ? "Done" : "Cancel"}
          </Button>
          {!unmatched && (
            <Button onClick={() => upload.mutate()} disabled={!csv.trim() || upload.isPending}>
              Process
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Contractual change orders amending the baseline (DT-01b). */
function ChangeOrdersCard({
  delivery,
  canEdit,
  canApprove,
  onChanged,
}: {
  delivery: ProjectDelivery;
  canEdit: boolean;
  canApprove: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const approve = useMutation({
    mutationFn: (orderId: string) => api.approveChangeOrder(delivery.projectId, orderId),
    onSuccess: () => {
      toast.success("Change order approved — baseline amended");
      onChanged();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to approve");
    },
  });

  const remove = useMutation({
    mutationFn: (orderId: string) => api.deleteChangeOrder(delivery.projectId, orderId),
    onSuccess: () => {
      toast.success("Draft change order deleted");
      onChanged();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to delete");
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Change orders</CardTitle>
          <CardDescription>
            Approved change orders amend the contractual baseline; EAC variance reports against the amended position.
            The Original Plan stays preserved.
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> New change order
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="text-right">Δ Hours</TableHead>
              <TableHead className="text-right">Δ Fees</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {delivery.changeOrders.map((c: ChangeOrder) => (
              <TableRow key={c.changeOrderId}>
                <TableCell>
                  <div className="font-medium">{c.title}</div>
                  {c.notes && <div className="text-xs text-[var(--color-muted-foreground)]">{c.notes}</div>}
                  {c.engagementDocumentId && (
                    <a
                      className="text-xs text-[var(--color-muted-foreground)] underline"
                      href={`/api/projects/${delivery.projectId}/documents/${c.engagementDocumentId}`}
                    >
                      Attached document
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.deltaHours > 0 ? "+" : ""}{hrs(c.deltaHours)}h</TableCell>
                <TableCell className="text-right tabular-nums">{c.deltaFees > 0 ? "+" : ""}{money(c.deltaFees)}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "approved" ? "ok" : "outline"}>{c.status}</Badge>
                  {c.status === "approved" && c.approvedBy && (
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      by {c.approvedBy}, {c.approvedAtUtc ? new Date(c.approvedAtUtc).toLocaleDateString() : ""}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                  {c.createdBy ?? "—"}, {new Date(c.createdAtUtc).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  {c.status === "draft" && canApprove && (
                    <Button variant="ghost" size="sm" onClick={() => approve.mutate(c.changeOrderId)}>
                      <Check className="size-4" /> Approve
                    </Button>
                  )}
                  {c.status === "draft" && canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(c.changeOrderId)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {delivery.changeOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[var(--color-muted-foreground)]">
                  No change orders.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {adding && (
        <ChangeOrderDialog
          projectId={delivery.projectId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function ChangeOrderDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [deltaHours, setDeltaHours] = useState("0");
  const [deltaFees, setDeltaFees] = useState("0");
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let documentId: string | null = null;
      if (file) {
        const doc = await api.uploadDocument(projectId, file, "TaskOrder");
        documentId = doc.engagementDocumentId;
      }
      return api.createChangeOrder(projectId, {
        title: title.trim(),
        notes: notes.trim() || null,
        deltaHours: Number(deltaHours) || 0,
        deltaFees: Number(deltaFees) || 0,
        engagementDocumentId: documentId,
      });
    },
    onSuccess: () => {
      toast.success("Change order created (draft)");
      onSaved();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to create change order");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New change order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CO-01: Extended scope for phase 2" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (scope / team / invoice schedule impact)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Δ Hours</Label>
              <Input type="number" value={deltaHours} onChange={(e) => setDeltaHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Δ Fees ($)</Label>
              <Input type="number" value={deltaFees} onChange={(e) => setDeltaFees(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Signed document (optional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
            {save.isPending ? "Saving…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Actual recoverable expenses per billing period (DT-04). */
function ExpensesCard({ delivery, canEdit, onChanged }: { delivery: ProjectDelivery; canEdit: boolean; onChanged: () => void }) {
  const [vendor, setVendor] = useState("");
  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createExpense(delivery.projectId, {
        periodStart: `${period}-01`,
        vendor: vendor.trim(),
        amount: Number(amount),
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Expense recorded");
      setVendor("");
      setPeriod("");
      setAmount("");
      setNotes("");
      onChanged();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to record expense");
    },
  });

  const remove = useMutation({
    mutationFn: (expenseId: string) => api.deleteExpense(delivery.projectId, expenseId),
    onSuccess: () => {
      toast.success("Expense removed");
      onChanged();
    },
    onError: () => toast.error("Failed to remove expense"),
  });

  const total = delivery.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recoverable expenses</CardTitle>
        <CardDescription>
          Actual recoverable expenses per billing period, including subcontractor invoices and vendor costs (DT-04).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Entered</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {delivery.expenses.map((e) => (
              <TableRow key={e.recoverableExpenseEntryId}>
                <TableCell>{e.periodStart.slice(0, 7)}</TableCell>
                <TableCell>{e.vendor}</TableCell>
                <TableCell className="text-right tabular-nums">{money(e.amount)}</TableCell>
                <TableCell className="text-xs text-[var(--color-muted-foreground)]">{e.notes ?? "—"}</TableCell>
                <TableCell className="text-xs text-[var(--color-muted-foreground)]">
                  {e.enteredBy ?? "—"}, {new Date(e.enteredAtUtc).toLocaleDateString()}
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(e.recoverableExpenseEntryId)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {delivery.expenses.length > 0 && (
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums">{money(total)}</TableCell>
                <TableCell colSpan={canEdit ? 3 : 2} />
              </TableRow>
            )}
            {delivery.expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-[var(--color-muted-foreground)]">
                  No expenses recorded.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Input type="month" className="w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor</Label>
              <Input className="w-48" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" min={0} className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input className="w-56" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button
              size="sm"
              disabled={!period || !vendor.trim() || amount === "" || create.isPending}
              onClick={() => create.mutate()}
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--color-muted-foreground)]">{sub}</p>}
    </div>
  );
}
