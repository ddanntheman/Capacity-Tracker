import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api } from "@/lib/api";
import type { DeliveryHealthRow } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const hours = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;

const statusStyles: Record<DeliveryHealthRow["status"], string> = {
  red: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  yellow: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  green: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
};

const statusLabels: Record<DeliveryHealthRow["status"], string> = {
  red: "Needs attention",
  yellow: "Watch",
  green: "Healthy",
};

function alerts(row: DeliveryHealthRow): string[] {
  const list: string[] = [];
  if (row.hoursOverrun) list.push(`Hours overrun: EAC ${hours(row.eacHours)} vs baseline ${hours(row.amendedBaselineHours)}`);
  if (row.feeOverrun) list.push(`Fee overrun: EAC ${money(row.eacFees)} vs TCV ${money(row.amendedTcv)}`);
  if (row.marginErosion) list.push("Margin erosion beyond tolerance");
  if (row.actualsStale)
    list.push(
      row.lastActualEntryUtc
        ? `Actuals stale (last entry ${new Date(row.lastActualEntryUtc).toLocaleDateString()})`
        : "No actuals entered",
    );
  if (row.pastZeroRevenueMonths > 0)
    list.push(`${row.pastZeroRevenueMonths} elapsed month(s) with zero forecast revenue`);
  return list;
}

export default function DeliveryHealthPage() {
  const [practice, setPractice] = useState("");
  const [status, setStatus] = useState("");
  const { data: rows, isLoading } = useQuery({
    queryKey: ["delivery-health"],
    queryFn: api.getDeliveryHealth,
  });

  const practices = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.practice).filter((p): p is string => !!p))].sort(),
    [rows],
  );
  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => (!practice || r.practice === practice) && (!status || r.status === status),
      ),
    [rows, practice, status],
  );

  if (isLoading || !rows) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>;

  const counts = {
    red: rows.filter((r) => r.status === "red").length,
    yellow: rows.filter((r) => r.status === "yellow").length,
    green: rows.filter((r) => r.status === "green").length,
  };

  const exportCsv = () =>
    downloadCsv(
      "delivery-health.csv",
      ["Client", "Engagement", "MD owner", "Practice", "Status", "EAC hours", "Baseline hours", "Hours variance", "EAC fees", "Amended TCV", "Fees variance", "EAC margin %", "Alerts"],
      filtered.map((r) => [
        r.client,
        r.engagement,
        r.mdOwner ?? "",
        r.practice ?? "",
        statusLabels[r.status],
        r.eacHours,
        r.amendedBaselineHours,
        r.hoursVariance,
        r.eacFees,
        r.amendedTcv,
        r.feesVariance,
        r.eacMarginPct ?? "",
        alerts(r).join("; "),
      ]),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Delivery health</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            EAC vs baseline, actuals cadence, and accrual coverage across all Closed/Won engagements.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-1 size-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["red", "yellow", "green"] as const).map((s) => (
          <Card
            key={s}
            className={`cursor-pointer transition-shadow hover:shadow-md ${status === s ? "ring-2 ring-[var(--color-ring)]" : ""}`}
            onClick={() => setStatus(status === s ? "" : s)}
          >
            <CardHeader className="pb-2">
              <CardDescription>{statusLabels[s]}</CardDescription>
              <CardTitle className="text-3xl">{counts[s]}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Engagements</CardTitle>
            <CardDescription>
              {filtered.length} of {rows.length} Closed/Won engagement(s)
            </CardDescription>
          </div>
          <select
            className="h-9 rounded-md border border-[var(--color-input)] bg-transparent px-2 text-sm"
            value={practice}
            onChange={(e) => setPractice(e.target.value)}
          >
            <option value="">All practices</option>
            {practices.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Client / engagement</TableHead>
                <TableHead>MD owner</TableHead>
                <TableHead>Practice</TableHead>
                <TableHead className="text-right">EAC hrs vs baseline</TableHead>
                <TableHead className="text-right">EAC fees vs TCV</TableHead>
                <TableHead className="text-right">EAC margin</TableHead>
                <TableHead>Alerts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-[var(--color-muted-foreground)]">
                    No engagements match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => {
                const alertList = alerts(r);
                return (
                  <TableRow key={r.projectId}>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[r.status]}>
                        {statusLabels[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link to={`/projects/${r.projectId}/delivery`} className="font-medium hover:underline">
                        {r.client} — {r.engagement}
                      </Link>
                      {r.hasEtcOverride && (
                        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">(ETC override)</span>
                      )}
                    </TableCell>
                    <TableCell>{r.mdOwner ?? "—"}</TableCell>
                    <TableCell>{r.practice ?? "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.hoursOverrun ? "text-red-600 dark:text-red-400" : ""}`}>
                      {hours(r.eacHours)} / {hours(r.amendedBaselineHours)}
                      <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">
                        ({r.hoursVariance >= 0 ? "+" : ""}
                        {hours(r.hoursVariance)})
                      </span>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${r.feeOverrun ? "text-red-600 dark:text-red-400" : ""}`}>
                      {money(r.eacFees)} / {money(r.amendedTcv)}
                      <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">
                        ({r.feesVariance >= 0 ? "+" : ""}
                        {money(r.feesVariance)})
                      </span>
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${r.marginErosion ? "text-red-600 dark:text-red-400" : ""}`}>
                      {r.eacMarginPct != null ? `${r.eacMarginPct}%` : "—"}
                    </TableCell>
                    <TableCell className="max-w-72 text-xs text-[var(--color-muted-foreground)]">
                      {alertList.length > 0 ? alertList.join(" · ") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
