import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Plus, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type PlanLineWrite } from "@/lib/api";
import { useAuth } from "@/auth";
import type { PlanLineItem, PricingPlan, RevenuePhase } from "@/lib/types";
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
  const [converting, setConverting] = useState(false);

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
    mutationFn: ({ lineId, reason }: { lineId: string; reason?: string }) => api.deletePlanLine(id, lineId, reason),
    onSuccess: () => {
      toast.success("Line removed");
      invalidate();
    },
    onError: () => toast.error("Failed to remove line"),
  });

  const setHours = useMutation({
    mutationFn: ({ lineId, weekStart, hours, reason }: { lineId: string; weekStart: string; hours: number; reason?: string }) =>
      api.setPlanLineHours(id, lineId, [{ weekStart, hours }], reason),
    onSuccess: () => invalidate(),
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to save hours");
    },
  });

  const weeks = useMemo(() => (plan ? weeksBetween(plan.startDate, plan.endDate) : []), [plan]);

  if (isLoading || !plan) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">{isLoading ? "Loading…" : "Plan not found."}</p>;
  }

  const locked = plan.status === "closedWon" || !canEdit;
  const won = plan.status === "closedWon";
  const staffingLocked = plan.status === "closedLost" || !canEdit;
  const feeBased = ["FixedFee", "Milestone", "Outcome"].includes(plan.pricingModel);

  // Post-win rolling-forecast changes require a logged reason (DT-01/01a).
  const promptReason = (): string | undefined | null => {
    if (!won) return undefined;
    const r = window.prompt("Reason for post-win change (e.g. staffing change, change order):");
    if (r == null || !r.trim()) return null;
    return r.trim();
  };

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
          <div className="flex gap-2">
            {hasRole("leadership") && plan.status === "activePursuit" && (
              <Button size="sm" onClick={() => setConverting(true)}>
                <Trophy className="size-4" /> Convert to Closed/Won
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => deletePlan.mutate()}>
              <Trash2 className="size-4" /> Delete plan
            </Button>
          </div>
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
          {canEdit && plan.status !== "closedLost" && (
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
                  locked={staffingLocked}
                  canEdit={canEdit && plan.status !== "closedLost"}
                  onSetHours={(weekStart, hours) => {
                    const reason = promptReason();
                    if (reason === null) return;
                    setHours.mutate({ lineId: line.planLineItemId, weekStart, hours, reason });
                  }}
                  onDelete={() => {
                    const reason = promptReason();
                    if (reason === null) return;
                    deleteLine.mutate({ lineId: line.planLineItemId, reason });
                  }}
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
            Named internal resources auto-book pipeline hours while the plan is an Active Pursuit, and committed hours
            after Closed/Won. Post-win staffing changes require a logged reason. Placeholders and subcontractors never
            book utilization.
          </p>
        </CardContent>
      </Card>

      {hasRole("editor", "leadership") && <PhasingCard planId={id} won={plan.status === "closedWon"} canEdit={canEdit && plan.status !== "closedLost"} />}

      {converting && (
        <ConvertDialog
          planId={id}
          onClose={() => setConverting(false)}
          onConverted={() => {
            setConverting(false);
            invalidate();
            void qc.invalidateQueries({ queryKey: ["plan-phasing", id] });
            void qc.invalidateQueries({ queryKey: ["projects"] });
          }}
        />
      )}

      {addingLine && (
        <LineDialog
          plan={plan}
          requireReason={won}
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

/**
 * Monthly revenue phasing (RS-05/06/07): the editable forecast layer next to
 * the immutable Original Plan layer locked at win. Inferred proposals are
 * marked until the EM saves an explicit phasing, and the total must tie to
 * TCV before the pursuit can convert (CW-03).
 */
function PhasingCard({ planId, won, canEdit }: { planId: string; won: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: phasing } = useQuery({
    queryKey: ["plan-phasing", planId],
    queryFn: () => api.getPlanPhasing(planId),
  });
  const [draft, setDraft] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (phases: RevenuePhase[]) => api.savePlanPhasing(planId, phases),
    onSuccess: () => {
      toast.success("Revenue phasing saved");
      setDraft({});
      void qc.invalidateQueries({ queryKey: ["plan-phasing", planId] });
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to save phasing");
    },
  });

  if (!phasing) return null;

  const original = new Map(phasing.originalPlan.map((p) => [p.periodStart, p.amount]));
  const rows = phasing.forecast.map((p) => ({
    ...p,
    amount: draft[p.periodStart] !== undefined ? Number(draft[p.periodStart]) || 0 : p.amount,
  }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const tiesOut = Math.abs(total - phasing.tcv) <= 0.5;
  const dirty = Object.keys(draft).length > 0;
  const inferred = phasing.forecast.some((p) => p.isInferred);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Monthly revenue phasing</CardTitle>
        <div className="flex items-center gap-2">
          {inferred && <Badge variant="outline">Inferred — confirm by saving</Badge>}
          <Badge variant={tiesOut ? "ok" : "warn"}>
            {tiesOut ? "Ties to TCV" : `Off by ${money(total - phasing.tcv)}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Forecast ($)</TableHead>
              {won && <TableHead className="text-right">Original plan ($)</TableHead>}
              {won && <TableHead className="text-right">Variance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const orig = original.get(row.periodStart) ?? 0;
              return (
                <TableRow key={row.periodStart}>
                  <TableCell>{row.periodStart.slice(0, 7)}</TableCell>
                  <TableCell className="p-1 text-right">
                    {canEdit ? (
                      <Input
                        type="number"
                        min={0}
                        className="ml-auto h-8 w-32 text-right"
                        value={draft[row.periodStart] ?? String(row.amount)}
                        onChange={(e) => setDraft((d) => ({ ...d, [row.periodStart]: e.target.value }))}
                      />
                    ) : (
                      <span className="tabular-nums">{money(row.amount)}</span>
                    )}
                  </TableCell>
                  {won && <TableCell className="text-right tabular-nums">{money(orig)}</TableCell>}
                  {won && (
                    <TableCell
                      className={`text-right tabular-nums ${
                        row.amount - orig > 0 ? "text-[var(--color-ok)]" : row.amount - orig < 0 ? "text-[var(--color-danger)]" : ""
                      }`}
                    >
                      {money(row.amount - orig)}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {money(total)} <span className="font-normal text-[var(--color-muted-foreground)]">/ TCV {money(phasing.tcv)}</span>
              </TableCell>
              {won && (
                <TableCell className="text-right font-semibold tabular-nums">
                  {money(phasing.originalPlan.reduce((s, p) => s + p.amount, 0))}
                </TableCell>
              )}
              {won && <TableCell />}
            </TableRow>
          </TableBody>
        </Table>
        {canEdit && (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={(!dirty && !inferred) || save.isPending}
              onClick={() => save.mutate(rows.map((r) => ({ periodStart: r.periodStart, amount: r.amount, isInferred: false })))}
            >
              Save phasing
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Authorized win conversion (CW-01..05): final pricing confirmation, then
 * the plan locks as the immutable Original Plan and pipeline bookings become
 * committed.
 */
function ConvertDialog({ planId, onClose, onConverted }: { planId: string; onClose: () => void; onConverted: () => void }) {
  const convert = useMutation({
    mutationFn: () => api.convertPlan(planId),
    onSuccess: (r) => {
      toast.success(`Converted to Closed/Won — TCV ${money(r.tcv)} across ${r.months} month(s)`);
      onConverted();
    },
    onError: (e) => {
      const body = e instanceof ApiError ? (e.body as { error?: string } | null) : null;
      toast.error(body?.error ?? "Failed to convert");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to Closed/Won</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>By converting, you confirm the final pricing plan (hours, rates, fees). This will:</p>
          <ul className="list-disc space-y-1 pl-5 text-[var(--color-muted-foreground)]">
            <li>lock the plan as the immutable Original Plan baseline;</li>
            <li>lock monthly revenue phasing (must tie to TCV);</li>
            <li>reclassify named-resource hours from Pipeline to Committed;</li>
            <li>activate engagement financials and the revenue forecast.</li>
          </ul>
          <p>Corrections afterwards require a logged, authorized re-baseline.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            Confirm pricing & convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function LineDialog({ plan, requireReason, onClose, onSaved }: { plan: PricingPlan; requireReason: boolean; onClose: () => void; onSaved: () => void }) {
  const [roleTitle, setRoleTitle] = useState("");
  const [reason, setReason] = useState("");
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
        reason: reason.trim() || null,
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
          {requireReason && (
            <div className="col-span-2 space-y-1.5">
              <Label>Reason (staffing change / change order)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Backfill for roll-off" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!roleTitle.trim() || (requireReason && !reason.trim()) || save.isPending}>
            {save.isPending ? "Saving…" : "Add role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
