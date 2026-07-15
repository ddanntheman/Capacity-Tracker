import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type PlanLineWrite } from "@/lib/api";
import { useAuth } from "@/auth";
import type { PlanLineItem, PricingPlan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineInput, InlineSelect } from "@/components/InlineEdit";
import { PlanStatusBadge } from "@/pages/PricingPlansPage";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function weeksBetween(startDate: string, endDate: string): string[] {
  const weeks: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const day = (start.getUTCDay() + 6) % 7; // Monday = 0
  start.setUTCDate(start.getUTCDate() - day);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    weeks.push(d.toISOString().slice(0, 10));
  }
  return weeks;
}

export default function PricingPlanDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");

  const { data: plan, isLoading } = useQuery({ queryKey: ["plan", id], queryFn: () => api.getPlan(id) });
  const { data: econ } = useQuery({
    queryKey: ["plan-economics", id, plan?.updatedAtUtc],
    queryFn: () => api.planEconomics(id),
    enabled: !!plan && hasRole("editor", "leadership"),
  });
  const { data: people = [] } = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const { data: practices = [] } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });

  const [addingLine, setAddingLine] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["plan", id] });
    void qc.invalidateQueries({ queryKey: ["plans"] });
    void qc.invalidateQueries({ queryKey: ["plan-economics", id] });
  };

  const update = useMutation({
    mutationFn: (patch: Partial<Parameters<typeof api.updatePlan>[1]>) => {
      if (!plan) throw new Error("no plan");
      return api.updatePlan(id, {
        mdOwnerId: plan.mdOwnerId,
        practice: plan.practice,
        status: plan.status,
        startDate: plan.startDate,
        endDate: plan.endDate,
        pricingModel: plan.pricingModel,
        blendedRate: plan.blendedRate,
        fixedFee: plan.fixedFee,
        technologyFees: plan.technologyFees,
        recoverableExpenses: plan.recoverableExpenses,
        notes: plan.notes,
        ...patch,
      });
    },
    onSuccess: () => {
      toast.success("Plan updated");
      invalidate();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to update plan");
    },
  });

  const deletePlan = useMutation({
    mutationFn: () => api.deletePlan(id),
    onSuccess: () => {
      toast.success("Plan deleted");
      void qc.invalidateQueries({ queryKey: ["plans"] });
      navigate("/plans");
    },
    onError: () => toast.error("Failed to delete plan"),
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: string) => api.deletePlanLine(id, lineId),
    onSuccess: () => {
      toast.success("Line removed");
      invalidate();
    },
    onError: () => toast.error("Failed to remove line"),
  });

  const setHours = useMutation({
    mutationFn: ({ lineId, weekStart, hours }: { lineId: string; weekStart: string; hours: number }) =>
      api.setPlanLineHours(id, lineId, [{ weekStart, hours }]),
    onSuccess: () => invalidate(),
    onError: () => toast.error("Failed to save hours"),
  });

  const weeks = useMemo(() => (plan ? weeksBetween(plan.startDate, plan.endDate) : []), [plan]);

  if (isLoading || !plan) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">{isLoading ? "Loading…" : "Plan not found."}</p>;
  }

  const locked = plan.status === "closedWon" || !canEdit;
  const feeBased = ["FixedFee", "Milestone", "Outcome"].includes(plan.pricingModel);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/plans" className="mb-1 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:underline">
            <ArrowLeft className="size-3.5" /> Pricing Plans
          </Link>
          <h1 className="text-2xl font-semibold">
            {plan.clientName} — {plan.projectName}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <PlanStatusBadge status={plan.status} />
            <Link to={`/projects/${plan.projectId}`} className="text-sm text-[var(--color-muted-foreground)] hover:underline">
              Open project
            </Link>
          </div>
        </div>
        {canEdit && plan.status !== "closedWon" && (
          <Button variant="outline" size="sm" onClick={() => deletePlan.mutate()}>
            <Trash2 className="size-4" /> Delete plan
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan setup</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
          <Field label="Status">
            <InlineSelect
              value={plan.status}
              display={plan.status}
              disabled={locked}
              options={[
                { value: "draft", label: "Draft" },
                { value: "activePursuit", label: "Active Pursuit" },
                { value: "closedLost", label: "Closed/Lost" },
              ]}
              onSave={(v) => update.mutate({ status: v })}
            />
          </Field>
          <Field label="MD owner">
            <InlineSelect
              value={plan.mdOwnerId ?? ""}
              display={people.find((p) => p.personId === plan.mdOwnerId)?.displayName ?? "—"}
              disabled={locked}
              allowNone
              noneLabel="No owner"
              options={people.map((p) => ({ value: p.personId, label: p.displayName }))}
              onSave={(v) => update.mutate({ mdOwnerId: v || null })}
            />
          </Field>
          <Field label="Practice">
            <InlineSelect
              value={plan.practice ?? ""}
              display={plan.practice ?? "—"}
              disabled={locked}
              allowNone
              noneLabel="No practice"
              options={practices.filter((p) => !p.isArchived).map((p) => ({ value: p.name, label: p.name }))}
              onSave={(v) => update.mutate({ practice: v || null })}
            />
          </Field>
          <Field label="Pricing model">
            <InlineSelect
              value={plan.pricingModel}
              display={plan.pricingModel}
              disabled={locked}
              options={[
                { value: "RoleBased", label: "Role-based rates" },
                { value: "BlendedRate", label: "Blended rate" },
                { value: "FixedFee", label: "Fixed fee" },
                { value: "Milestone", label: "Milestone" },
                { value: "Outcome", label: "Outcome" },
              ]}
              onSave={(v) => update.mutate({ pricingModel: v })}
            />
          </Field>
          <Field label="Engagement start">
            <InlineInput
              value={plan.startDate}
              display={plan.startDate}
              disabled={locked}
              onSave={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && update.mutate({ startDate: v })}
            />
          </Field>
          <Field label="Engagement end">
            <InlineInput
              value={plan.endDate}
              display={plan.endDate}
              disabled={locked}
              onSave={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && update.mutate({ endDate: v })}
            />
          </Field>
          {plan.pricingModel === "BlendedRate" && (
            <Field label="Blended rate ($/hr)">
              <InlineInput
                type="number"
                min={0}
                value={plan.blendedRate != null ? String(plan.blendedRate) : ""}
                display={plan.blendedRate != null ? money(plan.blendedRate) : "—"}
                disabled={locked}
                onSave={(v) => update.mutate({ blendedRate: v === "" ? null : Number(v) })}
              />
            </Field>
          )}
          {feeBased && (
            <Field label="Total fee ($)">
              <InlineInput
                type="number"
                min={0}
                value={plan.fixedFee != null ? String(plan.fixedFee) : ""}
                display={plan.fixedFee != null ? money(plan.fixedFee) : "—"}
                disabled={locked}
                onSave={(v) => update.mutate({ fixedFee: v === "" ? null : Number(v) })}
              />
            </Field>
          )}
          <Field label="Technology/other fees ($)">
            <InlineInput
              type="number"
              min={0}
              value={String(plan.technologyFees)}
              display={money(plan.technologyFees)}
              disabled={locked}
              onSave={(v) => v !== "" && update.mutate({ technologyFees: Number(v) })}
            />
          </Field>
          <Field label="Recoverable expenses ($)">
            <InlineInput
              type="number"
              min={0}
              value={String(plan.recoverableExpenses)}
              display={money(plan.recoverableExpenses)}
              disabled={locked}
              onSave={(v) => v !== "" && update.mutate({ recoverableExpenses: Number(v) })}
            />
          </Field>
        </CardContent>
      </Card>

      {econ && econ.validationErrors.length > 0 && (
        <Card className="border-[var(--color-warn)]">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-warn)]" />
              <ul className="space-y-0.5">
                {econ.validationErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {econ && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal economics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Total hours" value={econ.totalHours.toLocaleString()} />
              <Stat label="Labor fees" value={money(econ.laborFees)} />
              <Stat label="TCV" value={money(econ.tcv)} />
              <Stat label="Job RPH" value={econ.jobRph != null ? money(econ.jobRph) : "—"} />
              <Stat
                label="Job margin"
                value={econ.jobMarginPct != null ? `${econ.jobMarginPct}%` : "—"}
                sub={`GP ${money(econ.grossProfit)}`}
              />
              <Stat label="Internal cost" value={money(econ.internalCost)} />
              <Stat label="Subcontractor cost" value={money(econ.subcontractorCost)} />
              <Stat label="Technology fees" value={money(econ.technologyFees)} />
              <Stat label="Gross fees @ standard" value={money(econ.grossFeesAtStandard)} />
              <Stat
                label="Net fees"
                value={money(econ.netFees)}
                sub={`Adj ${money(econ.feeAdjustment)} · Recovery ${econ.recoveryPct != null ? `${econ.recoveryPct}%` : "—"}`}
              />
              <Stat label="Billable internal hours" value={econ.billableHours.toLocaleString()} />
              <Stat label="Internal RPH" value={econ.internalRph != null ? money(econ.internalRph) : "—"} />
              <Stat label="Internal margin" value={econ.internalMarginPct != null ? `${econ.internalMarginPct}%` : "—"} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Delivery team & weekly hours</CardTitle>
          {canEdit && plan.status !== "closedWon" && (
            <Button size="sm" variant="outline" onClick={() => setAddingLine(true)}>
              <Plus className="size-4" /> Add role
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56 sticky left-0 bg-[var(--color-card)]">Role</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {weeks.map((w) => (
                  <TableHead key={w} className="whitespace-nowrap text-right text-xs">
                    {w.slice(5)}
                  </TableHead>
                ))}
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.lineItems.map((line) => (
                <LineRow
                  key={line.planLineItemId}
                  line={line}
                  weeks={weeks}
                  locked={locked}
                  canEdit={canEdit && plan.status !== "closedWon"}
                  onSetHours={(weekStart, hours) => setHours.mutate({ lineId: line.planLineItemId, weekStart, hours })}
                  onDelete={() => deleteLine.mutate(line.planLineItemId)}
                />
              ))}
              {plan.lineItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={weeks.length + 3} className="text-center text-[var(--color-muted-foreground)]">
                    No delivery-team roles yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            Named internal resources auto-book pipeline hours while the plan is an Active Pursuit. Placeholders and
            subcontractors never book utilization.
          </p>
        </CardContent>
      </Card>

      {addingLine && (
        <LineDialog
          plan={plan}
          onClose={() => setAddingLine(false)}
          onSaved={() => {
            setAddingLine(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
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

function LineRow({
  line,
  weeks,
  locked,
  canEdit,
  onSetHours,
  onDelete,
}: {
  line: PlanLineItem;
  weeks: string[];
  locked: boolean;
  canEdit: boolean;
  onSetHours: (weekStart: string, hours: number) => void;
  onDelete: () => void;
}) {
  const hoursByWeek = new Map(line.weekHours.map((w) => [w.weekStart, w.hours]));
  const total = line.weekHours.reduce((s, w) => s + w.hours, 0);

  return (
    <TableRow>
      <TableCell className="sticky left-0 bg-[var(--color-card)]">
        <div className="font-medium">{line.personName ?? line.roleTitle}</div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
          {line.personName && <span>{line.roleTitle}</span>}
          {!line.personName && line.organization === "internal" && <Badge variant="outline">Unnamed</Badge>}
          {line.organization === "subcontractor" && (
            <Badge variant="secondary">Sub{line.subcontractorFirm ? ` · ${line.subcontractorFirm}` : ""}</Badge>
          )}
          {line.rank && <span>{line.rank}</span>}
          {line.geography && <span>· {line.geography}</span>}
        </div>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{total.toLocaleString()}</TableCell>
      {weeks.map((w) => {
        const h = hoursByWeek.get(w) ?? 0;
        return (
          <TableCell key={w} className="p-1 text-right">
            <InlineInput
              type="number"
              min={0}
              max={168}
              value={h ? String(h) : ""}
              display={h ? String(h) : "·"}
              disabled={locked}
              className="justify-end"
              inputClassName="w-14 text-right"
              onSave={(v) => onSetHours(w, v === "" ? 0 : Number(v))}
            />
          </TableCell>
        );
      })}
      {canEdit && (
        <TableCell className="text-right">
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

function LineDialog({ plan, onClose, onSaved }: { plan: PricingPlan; onClose: () => void; onSaved: () => void }) {
  const [roleTitle, setRoleTitle] = useState("");
  const [rank, setRank] = useState("");
  const [geography, setGeography] = useState("US");
  const [organization, setOrganization] = useState<"internal" | "subcontractor">("internal");
  const [subcontractorFirm, setSubcontractorFirm] = useState("");
  const [personId, setPersonId] = useState("");
  const [costRateOverride, setCostRateOverride] = useState("");
  const [billRateOverride, setBillRateOverride] = useState("");
  const [clientRate, setClientRate] = useState("");

  const { data: people = [] } = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });

  const save = useMutation({
    mutationFn: () => {
      const body: PlanLineWrite = {
        roleTitle: roleTitle.trim(),
        rank: rank || null,
        geography: geography.trim() || null,
        organization,
        subcontractorFirm: subcontractorFirm.trim() || null,
        personId: organization === "internal" && personId ? personId : null,
        costRateOverride: costRateOverride === "" ? null : Number(costRateOverride),
        billRateOverride: billRateOverride === "" ? null : Number(billRateOverride),
        clientRate: clientRate === "" ? null : Number(clientRate),
      };
      return api.createPlanLine(plan.pricingPlanId, body);
    },
    onSuccess: () => {
      toast.success("Role added");
      onSaved();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to add role");
    },
  });

  const ranks = ["Analyst", "Associate", "Senior Associate", "Consultant", "Senior Consultant", "Manager", "Senior Manager", "Director", "Managing Director", "Partner"];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add delivery-team role</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Role / title</Label>
            <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Engagement Manager" />
          </div>
          <div className="space-y-1.5">
            <Label>Organization</Label>
            <Select value={organization} onValueChange={(v) => setOrganization(v as "internal" | "subcontractor")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal AC</SelectItem>
                <SelectItem value="subcontractor">Subcontractor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Level / rank</Label>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger>
                <SelectValue placeholder="Select rank" />
              </SelectTrigger>
              <SelectContent>
                {ranks.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Geography</Label>
            <Input value={geography} onChange={(e) => setGeography(e.target.value)} />
          </div>
          {organization === "internal" ? (
            <div className="space-y-1.5">
              <Label>Named resource (optional)</Label>
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unnamed placeholder" />
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.personId} value={p.personId}>
                      {p.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Subcontractor firm</Label>
              <Input value={subcontractorFirm} onChange={(e) => setSubcontractorFirm(e.target.value)} />
            </div>
          )}
          {organization === "subcontractor" && (
            <>
              <div className="space-y-1.5">
                <Label>Cost rate ($/hr)</Label>
                <Input type="number" min={0} value={costRateOverride} onChange={(e) => setCostRateOverride(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Client rate ($/hr)</Label>
                <Input type="number" min={0} value={billRateOverride} onChange={(e) => setBillRateOverride(e.target.value)} />
              </div>
            </>
          )}
          {plan.pricingModel === "RoleBased" && (
            <div className="space-y-1.5">
              <Label>Client rate override ($/hr)</Label>
              <Input type="number" min={0} value={clientRate} onChange={(e) => setClientRate(e.target.value)} placeholder="Rate card default" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!roleTitle.trim() || save.isPending}>
            {save.isPending ? "Saving…" : "Add role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
