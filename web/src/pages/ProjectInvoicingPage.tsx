import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import type { InvoicePeriod } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const hrs = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });

export default function ProjectInvoicingPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const period = params.get("period") ?? undefined;
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ["invoicing", id, period],
    queryFn: () => api.getProjectInvoicing(id, period),
    retry: false,
  });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const project = projects.find((p) => p.projectId === id);

  if (isLoading) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;
  if (error || !invoice) {
    return (
      <div className="space-y-2">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:underline">
          <ArrowLeft className="size-3.5" /> Back to project
        </Link>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No pricing plan exists for this engagement yet — invoicing starts from a staffed pricing plan.
        </p>
      </div>
    );
  }

  const periodKey = invoice.periodStart.slice(0, 7);

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/projects/${id}`} className="mb-1 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:underline">
          <ArrowLeft className="size-3.5" /> {project ? `${project.clientName} — ${project.projectName}` : "Back to project"}
        </Link>
        <h1 className="text-2xl font-semibold">Invoicing</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{invoice.feeStructure}</Badge>
          <Badge variant={invoice.feeStructureConfirmed ? "ok" : "warn"}>
            {invoice.feeStructureConfirmed ? "Fee structure confirmed" : "Fee structure not confirmed"}
          </Badge>
          <Badge variant="outline">{invoice.invoiceBasis === "schedule" ? "Invoiced from schedule" : "Invoiced from hours"}</Badge>
          <select
            className="h-8 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm"
            value={periodKey}
            onChange={(e) => setParams({ period: e.target.value })}
          >
            {invoice.availablePeriods.map((p) => (
              <option key={p} value={p.slice(0, 7)}>
                {monthLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <InvoiceHoursCard invoice={invoice} />
      <ReconciliationCard invoice={invoice} periodKey={periodKey} />
      <CaptureCard invoice={invoice} periodKey={periodKey} canEdit={canEdit} onChanged={() => void qc.invalidateQueries({ queryKey: ["invoicing", id] })} />
    </div>
  );
}

/** Client-facing invoice hours table at contract pricing (INV-01/02). */
function InvoiceHoursCard({ invoice }: { invoice: InvoicePeriod }) {
  const weeks = [...new Set(invoice.lines.flatMap((l) => l.weeks.map((w) => w.weekStart)))].sort();

  const exportCsv = () =>
    downloadCsv(
      `invoice-${invoice.periodStart.slice(0, 7)}.csv`,
      ["Role", "Resource", ...weeks.map((w) => w.slice(5, 10)), "Total hours", "Rate", "Amount"],
      [
        ...invoice.lines.map((l) => [
          l.role,
          l.resource ?? "",
          ...weeks.map((w) => l.weeks.find((c) => c.weekStart === w)?.hours ?? 0),
          l.totalHours,
          l.rate ?? "",
          l.amount,
        ]),
        ["Total", "", ...weeks.map(() => ""), invoice.totalHours, "", invoice.invoiceAmount],
      ],
    );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Invoice hours — {monthLabel(invoice.periodStart)}</CardTitle>
          <CardDescription>Weekly hours by role and resource at contract pricing.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-1 size-3.5" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Resource</TableHead>
                {weeks.map((w) => (
                  <TableHead key={w} className="text-right">{w.slice(5, 10)}</TableHead>
                ))}
                <TableHead className="text-right">Total hrs</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((l) => (
                <TableRow key={l.planLineItemId}>
                  <TableCell>{l.role}</TableCell>
                  <TableCell>{l.resource ?? <span className="text-[var(--color-muted-foreground)]">Unstaffed</span>}</TableCell>
                  {weeks.map((w) => {
                    const cell = l.weeks.find((c) => c.weekStart === w);
                    return (
                      <TableCell key={w} className="text-right tabular-nums">
                        {cell ? <span className={cell.fromActuals ? "" : "text-[var(--color-muted-foreground)]"}>{hrs(cell.hours)}</span> : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-medium tabular-nums">{hrs(l.totalHours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.rate != null ? money(l.rate) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium">
                <TableCell colSpan={2 + weeks.length}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{hrs(invoice.totalHours)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{money(invoice.invoiceAmount)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        {invoice.invoiceBasis === "schedule" && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            Fixed-fee / milestone / outcome work invoices from the confirmed invoice schedule ({money(invoice.invoiceAmount)} this period); hours are shown for reference only.
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Muted hours are forecast; regular hours are charged actuals.</p>
      </CardContent>
    </Card>
  );
}

/** Internal SAP reconciliation (INV-03). */
function ReconciliationCard({ invoice, periodKey }: { invoice: InvoicePeriod; periodKey: string }) {
  const exportCsv = () =>
    downloadCsv(
      `reconciliation-${periodKey}.csv`,
      ["Role", "Resource", "Expected hrs", "Charged hrs", "Variance", "Std bill rate", "Gross fees at standard"],
      [
        ...invoice.reconciliation.map((r) => [
          r.role,
          r.resource ?? "",
          r.expectedHours,
          r.chargedHours,
          r.hoursVariance,
          r.standardBillRate ?? "",
          r.grossFeesAtStandard,
        ]),
        [],
        ["Gross fees at standard", invoice.grossFeesAtStandard],
        ["Recoverable expenses", invoice.recoverableExpenses],
        ["Net fees", invoice.netFees],
        ["Fee adjustment", invoice.feeAdjustment],
        ["Recovery %", invoice.recoveryPct ?? ""],
        ["RPH", invoice.rph ?? ""],
      ],
    );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">SAP reconciliation</CardTitle>
          <CardDescription>Expected vs charged hours by internal resource, gross fees at standard bill rates, and net-fee economics.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-1 size-3.5" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead className="text-right">Expected hrs</TableHead>
                <TableHead className="text-right">Charged hrs</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Std bill rate</TableHead>
                <TableHead className="text-right">Gross @ standard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.reconciliation.map((r) => (
                <TableRow key={r.planLineItemId}>
                  <TableCell>{r.role}</TableCell>
                  <TableCell>{r.resource ?? <span className="text-[var(--color-muted-foreground)]">Unstaffed</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{hrs(r.expectedHours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{hrs(r.chargedHours)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.hoursVariance > 0 ? "text-red-600" : ""}`}>
                    {r.hoursVariance > 0 ? "+" : ""}
                    {hrs(r.hoursVariance)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.standardBillRate != null ? money(r.standardBillRate) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.grossFeesAtStandard)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Gross @ standard" value={money(invoice.grossFeesAtStandard)} />
          <Stat label="Recoverable expenses" value={money(invoice.recoverableExpenses)} />
          <Stat label="Net fees" value={money(invoice.netFees)} />
          <Stat label="Fee adjustment" value={money(invoice.feeAdjustment)} />
          <Stat label="Recovery" value={invoice.recoveryPct != null ? `${invoice.recoveryPct}%` : "—"} />
          <Stat label="RPH" value={invoice.rph != null ? money(invoice.rph) : "—"} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Actual invoiced amount + variance vs forecast (INV-04). */
function CaptureCard({ invoice, periodKey, canEdit, onChanged }: { invoice: InvoicePeriod; periodKey: string; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Invoice record — {monthLabel(invoice.periodStart)}</CardTitle>
          <CardDescription>Actual invoiced amount, invoice date, and variance vs the forecast invoice.</CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {invoice.invoicedAmount != null ? "Update invoice" : "Record invoice"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {invoice.invoicedAmount == null ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No invoice captured for this period yet. Forecast invoice: {money(invoice.invoiceAmount)}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Invoiced" value={money(invoice.invoicedAmount)} />
            <Stat label="Invoice date" value={invoice.invoiceDate ? new Date(`${invoice.invoiceDate}T00:00:00`).toLocaleDateString() : "—"} />
            <Stat label="Forecast" value={money(invoice.invoiceAmount)} />
            <Stat
              label="Variance"
              value={`${(invoice.invoiceVariance ?? 0) >= 0 ? "+" : ""}${money(invoice.invoiceVariance ?? 0)}`}
            />
          </div>
        )}
        {invoice.invoiceNotes && <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{invoice.invoiceNotes}</p>}
      </CardContent>
      {open && (
        <CaptureDialog
          invoice={invoice}
          periodKey={periodKey}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function CaptureDialog({ invoice, periodKey, onClose, onSaved }: { invoice: InvoicePeriod; periodKey: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(invoice.invoicedAmount ?? invoice.invoiceAmount));
  const [date, setDate] = useState(invoice.invoiceDate ?? "");
  const [notes, setNotes] = useState(invoice.invoiceNotes ?? "");

  const save = useMutation({
    mutationFn: () =>
      api.captureInvoice(invoice.projectId, periodKey, {
        invoicedAmount: Number(amount),
        invoiceDate: date || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Invoice recorded");
      onSaved();
    },
    onError: () => toast.error("Failed to record invoice"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record invoice — {monthLabel(invoice.periodStart)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="inv-amount">Invoiced amount ($)</Label>
            <Input id="inv-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-date">Invoice date</Label>
            <Input id="inv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-notes">Notes</Label>
            <Input id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || amount === "" || Number(amount) < 0}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
