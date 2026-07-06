import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ActualsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());

  const peopleQuery = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const actualsQuery = useQuery({ queryKey: ["actuals", year], queryFn: () => api.listActuals(year) });

  // key: `${personId}:${monthIndex}` -> hours
  const saved = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of actualsQuery.data ?? []) {
      const monthIndex = new Date(a.month).getUTCMonth();
      m.set(`${a.personId}:${monthIndex}`, a.chargeableHours);
    }
    return m;
  }, [actualsQuery.data]);

  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());

  const changeYear = (y: number) => {
    setYear(y);
    setDrafts(new Map());
  };

  const save = useMutation({
    mutationFn: (vars: { personId: string; monthIndex: number; hours: number }) =>
      api.upsertActual({
        personId: vars.personId,
        month: `${year}-${String(vars.monthIndex + 1).padStart(2, "0")}-01`,
        chargeableHours: vars.hours,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["actuals", year] });
    },
    onError: () => toast.error("Failed to save actual hours"),
  });

  const commit = (personId: string, monthIndex: number) => {
    const key = `${personId}:${monthIndex}`;
    const draft = drafts.get(key);
    if (draft == null) return;
    const hours = Math.max(0, Number(draft) || 0);
    const current = saved.get(key) ?? 0;
    if (hours !== current) save.mutate({ personId, monthIndex, hours });
    setDrafts((d) => {
      const next = new Map(d);
      next.delete(key);
      return next;
    });
  };

  const totalFor = (personId: string) =>
    MONTH_LABELS.reduce((s, _, i) => s + (saved.get(`${personId}:${i}`) ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Actuals</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Actual chargeable hours per person per month.{canEdit ? " Edit a cell and tab away to save." : " Read-only view."}
          </p>
        </div>
        <Select value={String(year)} onValueChange={(v) => changeYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actual chargeable hours — {year}</CardTitle>
          <CardDescription>Feeds "Actual to date" on the Resource Summary.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm" aria-label="Actual hours grid">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--color-card)] p-2 text-left font-medium">Person</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="min-w-16 p-2 text-center font-medium text-[var(--color-muted-foreground)]">
                      {m}
                    </th>
                  ))}
                  <th className="p-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(peopleQuery.data ?? []).map((person) => (
                  <tr key={person.personId} className="border-t">
                    <td className="sticky left-0 z-10 bg-[var(--color-card)] p-2 font-medium">{person.displayName}</td>
                    {MONTH_LABELS.map((_, i) => {
                      const key = `${person.personId}:${i}`;
                      const value = drafts.get(key) ?? String(saved.get(key) ?? "");
                      return (
                        <td key={key} className="p-1 text-center">
                          {canEdit ? (
                            <Input
                              type="number"
                              min={0}
                              className="h-8 w-16 text-center"
                              value={value}
                              onChange={(e) =>
                                setDrafts((d) => new Map(d).set(key, e.target.value))
                              }
                              onBlur={() => commit(person.personId, i)}
                              aria-label={`${person.displayName} ${MONTH_LABELS[i]} actual hours`}
                            />
                          ) : (
                            <span className="tabular-nums">{saved.get(key) ?? "—"}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right font-medium tabular-nums">{totalFor(person.personId)}</td>
                  </tr>
                ))}
                {(peopleQuery.data?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={14} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      No people to display.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
