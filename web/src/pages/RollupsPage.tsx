import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Target } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import type { FirmRollup, RollupEngagement } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort();
}

export default function RollupsPage() {
  const { hasRole } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [filters, setFilters] = useState({ client: "", jobCode: "", mdOwner: "", engagementType: "", practice: "" });
  const [editingTargets, setEditingTargets] = useState(false);
  const qc = useQueryClient();

  const from = `${year}-01`;
  const to = `${year}-12`;
  const { data: rollup, isLoading } = useQuery({
    queryKey: ["rollup", from, to],
    queryFn: () => api.getFirmRollup(from, to),
  });

  const engagements = useMemo(() => {
    if (!rollup) return [];
    return rollup.engagements.filter(
      (e) =>
        (!filters.client || e.client === filters.client) &&
        (!filters.jobCode || e.jobCode.toLowerCase().includes(filters.jobCode.toLowerCase())) &&
        (!filters.mdOwner || e.mdOwner === filters.mdOwner) &&
        (!filters.engagementType || e.engagementType === filters.engagementType) &&
        (!filters.practice || e.practice === filters.practice),
    );
  }, [rollup, filters]);

  const filtered = Object.values(filters).some(Boolean);

  if (isLoading || !rollup) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;

  const exportCsv = () =>
    downloadCsv(
      `firm-rollup-${year}.csv`,
      ["Month", "Original Plan", "Forecast", "Actual", "Net fees (forecast)", "Net fees (actual)", "Revenue target", "Net fees target"],
      rollup.months.map((m) => [
        m.periodStart.slice(0, 7),
        m.originalPlan,
        m.forecast,
        m.actual,
        m.netFeesForecast,
        m.netFeesActual,
        m.revenueTarget ?? "",
        m.netFeesTarget ?? "",
      ]),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Firm rollups</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Net Revenue and Net Fees derived live from engagement phasing, invoices, and expenses — vs finance targets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>FY {y}</option>
            ))}
          </select>
          {hasRole("leadership") && (
            <Button size="sm" variant="outline" onClick={() => setEditingTargets(true)}>
              <Target className="mr-1 size-3.5" /> Targets
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1 size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net Revenue vs targets — FY {year}</CardTitle>
          <CardDescription>Original Plan vs Revised Forecast vs Actuals (captured invoices) by billing period.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Original Plan</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Net fees (fcst)</TableHead>
                  <TableHead className="text-right">Net fees (act)</TableHead>
                  <TableHead className="text-right">Rev target</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rollup.months.map((m) => {
                  const variance = m.revenueTarget != null ? m.forecast - m.revenueTarget : null;
                  const pct = m.revenueTarget ? Math.round(((m.forecast - m.revenueTarget) / m.revenueTarget) * 100) : null;
                  return (
                    <TableRow key={m.periodStart}>
                      <TableCell>{monthLabel(m.periodStart)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.originalPlan)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.forecast)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.actual)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.netFeesForecast)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.netFeesActual)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.revenueTarget != null ? money(m.revenueTarget) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {variance != null ? `${variance >= 0 ? "+" : ""}${money(variance)}${pct != null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}` : "—"}
                      </TableCell>
                      <TableCell>
                        {variance == null ? (
                          <span className="text-xs text-[var(--color-muted-foreground)]">No target</span>
                        ) : (
                          <Badge variant={variance >= 0 ? "ok" : "over"}>{variance >= 0 ? "On track" : "Off track"}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-medium">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{money(rollup.months.reduce((s, m) => s + m.originalPlan, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(rollup.months.reduce((s, m) => s + m.forecast, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(rollup.months.reduce((s, m) => s + m.actual, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(rollup.months.reduce((s, m) => s + m.netFeesForecast, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(rollup.months.reduce((s, m) => s + m.netFeesActual, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rollup.months.some((m) => m.revenueTarget != null)
                      ? money(rollup.months.reduce((s, m) => s + (m.revenueTarget ?? 0), 0))
                      : "—"}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagements{filtered ? ` (${engagements.length} matching)` : ""}</CardTitle>
          <CardDescription>Drill from firm to engagement — expand a row for its monthly phasing, or open the plan for line-item detail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Client" value={filters.client} options={unique(rollup.engagements.map((e) => e.client))} onChange={(v) => setFilters((f) => ({ ...f, client: v }))} />
            <Input
              className="h-8 w-36 text-sm"
              placeholder="Job code…"
              value={filters.jobCode}
              onChange={(e) => setFilters((f) => ({ ...f, jobCode: e.target.value }))}
            />
            <FilterSelect label="MD owner" value={filters.mdOwner} options={unique(rollup.engagements.map((e) => e.mdOwner))} onChange={(v) => setFilters((f) => ({ ...f, mdOwner: v }))} />
            <FilterSelect label="Type" value={filters.engagementType} options={unique(rollup.engagements.map((e) => e.engagementType))} onChange={(v) => setFilters((f) => ({ ...f, engagementType: v }))} />
            <FilterSelect label="Practice" value={filters.practice} options={unique(rollup.engagements.map((e) => e.practice))} onChange={(v) => setFilters((f) => ({ ...f, practice: v }))} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Client</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Job code</TableHead>
                  <TableHead>MD owner</TableHead>
                  <TableHead>Practice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Original Plan</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engagements.map((e) => (
                  <EngagementRow key={e.pricingPlanId} engagement={e} />
                ))}
                {engagements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-[var(--color-muted-foreground)]">
                      No engagements match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editingTargets && (
        <TargetsDialog
          rollup={rollup}
          onClose={() => setEditingTargets(false)}
          onSaved={() => {
            setEditingTargets(false);
            void qc.invalidateQueries({ queryKey: ["rollup"] });
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      className="h-8 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function EngagementRow({ engagement: e }: { engagement: RollupEngagement }) {
  const [open, setOpen] = useState(false);
  const active = e.months.filter((m) => m.originalPlan !== 0 || m.forecast !== 0 || m.actual !== 0);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <TableCell className="w-6">{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
        <TableCell>{e.client}</TableCell>
        <TableCell>
          <Link to={`/projects/${e.projectId}/invoicing`} className="hover:underline" onClick={(ev) => ev.stopPropagation()}>
            {e.engagement}
          </Link>
        </TableCell>
        <TableCell>
          <span className={e.jobCodePlaceholder ? "text-[var(--color-muted-foreground)]" : ""}>{e.jobCode}</span>
          {e.jobCodePlaceholder && <Badge variant="outline" className="ml-1">pending</Badge>}
        </TableCell>
        <TableCell>{e.mdOwner ?? "—"}</TableCell>
        <TableCell>{e.practice ?? "—"}</TableCell>
        <TableCell><Badge variant={e.planStatus === "closedWon" ? "ok" : "outline"}>{e.planStatus}</Badge></TableCell>
        <TableCell className="text-right tabular-nums">{money(e.originalPlanTotal)}</TableCell>
        <TableCell className="text-right tabular-nums">{money(e.forecastTotal)}</TableCell>
        <TableCell className="text-right tabular-nums">{money(e.actualTotal)}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={9}>
            <div className="flex flex-wrap gap-2 py-1">
              {active.map((m) => (
                <div key={m.periodStart} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">
                  <div className="font-medium">{monthLabel(m.periodStart)}</div>
                  <div className="tabular-nums text-[var(--color-muted-foreground)]">
                    OP {money(m.originalPlan)} · Fcst {money(m.forecast)} · Act {money(m.actual)}
                  </div>
                </div>
              ))}
              <Link to={`/plans/${e.pricingPlanId}`} className="self-center text-xs text-[var(--color-muted-foreground)] hover:underline">
                Line-item detail →
              </Link>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Finance-maintained monthly revenue / net-fee targets (RU-04), leadership only. */
function TargetsDialog({ rollup, onClose, onSaved }: { rollup: FirmRollup; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      rollup.months.map((m) => [m.periodStart, { revenue: String(m.revenueTarget ?? ""), netFees: String(m.netFeesTarget ?? "") }]),
    ),
  );

  const save = useMutation({
    mutationFn: () =>
      api.upsertFirmTargets(
        Object.entries(values)
          .filter(([, v]) => v.revenue !== "" || v.netFees !== "")
          .map(([period, v]) => ({
            periodStart: period,
            revenueTarget: Number(v.revenue || 0),
            netFeesTarget: Number(v.netFees || 0),
          })),
      ),
    onSuccess: () => {
      toast.success("Targets saved");
      onSaved();
    },
    onError: () => toast.error("Failed to save targets"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Monthly firm targets</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {rollup.months.map((m) => (
            <div key={m.periodStart} className="grid grid-cols-3 items-center gap-2">
              <span className="text-sm">{monthLabel(m.periodStart)}</span>
              <Input
                type="number"
                min="0"
                placeholder="Revenue target"
                value={values[m.periodStart].revenue}
                onChange={(e) => setValues((v) => ({ ...v, [m.periodStart]: { ...v[m.periodStart], revenue: e.target.value } }))}
              />
              <Input
                type="number"
                min="0"
                placeholder="Net fees target"
                value={values[m.periodStart].netFees}
                onChange={(e) => setValues((v) => ({ ...v, [m.periodStart]: { ...v[m.periodStart], netFees: e.target.value } }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save targets</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
