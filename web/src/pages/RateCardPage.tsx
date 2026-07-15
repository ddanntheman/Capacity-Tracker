import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { RateCardEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InlineInput } from "@/components/InlineEdit";
import { matchesSearch, useSearchText, useUrlFilters } from "@/lib/urlFilters";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RateCardPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("leadership");
  const qc = useQueryClient();

  const filters = useUrlFilters({ q: "" });
  const search = useSearchText(filters);

  const { data: entries = [], isLoading } = useQuery({ queryKey: ["ratecard"], queryFn: () => api.listRateCard() });
  const rows = entries.filter((e) => matchesSearch(search.text, `${e.rank} ${e.geography}`));

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["ratecard"] });

  const update = useMutation({
    mutationFn: ({ entry, patch }: { entry: RateCardEntry; patch: Partial<RateCardEntry> }) =>
      api.updateRateCardEntry(entry.rateCardEntryId, {
        rank: patch.rank ?? entry.rank,
        geography: patch.geography ?? entry.geography,
        effectiveFrom: patch.effectiveFrom ?? entry.effectiveFrom,
        costRate: patch.costRate ?? entry.costRate,
        billRate: patch.billRate ?? entry.billRate,
      }),
    onSuccess: () => {
      toast.success("Rate updated");
      invalidate();
    },
    onError: () => toast.error("Failed to update rate"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRateCardEntry(id),
    onSuccess: () => {
      toast.success("Rate removed");
      invalidate();
    },
    onError: () => toast.error("Failed to remove rate"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rate Card</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Effective-dated standard cost and bill rates by rank and geography. Pricing plans pick the latest rate on or
            before each engagement week.
          </p>
        </div>
        {canEdit && <AddRateDialog onAdded={invalidate} />}
      </div>

      <Input placeholder="Search rank or geography…" value={search.text} onChange={(e) => search.onChange(e.target.value)} className="w-64" />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Geography</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead className="text-right">Cost rate</TableHead>
                  <TableHead className="text-right">Bill rate</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.rateCardEntryId}>
                    <TableCell className="font-medium">{e.rank}</TableCell>
                    <TableCell>{e.geography}</TableCell>
                    <TableCell>
                      <InlineInput
                        value={e.effectiveFrom}
                        display={e.effectiveFrom}
                        disabled={!canEdit}
                        onSave={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && update.mutate({ entry: e, patch: { effectiveFrom: v } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        value={String(e.costRate)}
                        display={money(e.costRate)}
                        disabled={!canEdit}
                        className="justify-end"
                        inputClassName="text-right"
                        onSave={(v) => v !== "" && update.mutate({ entry: e, patch: { costRate: Number(v) } })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        value={String(e.billRate)}
                        display={money(e.billRate)}
                        disabled={!canEdit}
                        className="justify-end"
                        inputClassName="text-right"
                        onSave={(v) => v !== "" && update.mutate({ entry: e, patch: { billRate: Number(v) } })}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => remove.mutate(e.rateCardEntryId)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-[var(--color-muted-foreground)]">
                      No rate card entries yet.
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

function AddRateDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState("");
  const [geography, setGeography] = useState("US");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [costRate, setCostRate] = useState("");
  const [billRate, setBillRate] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createRateCardEntry({
        rank: rank.trim(),
        geography: geography.trim(),
        effectiveFrom,
        costRate: Number(costRate),
        billRate: Number(billRate),
      }),
    onSuccess: () => {
      toast.success("Rate added");
      setOpen(false);
      setRank("");
      setCostRate("");
      setBillRate("");
      onAdded();
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.status === 409
          ? "An entry for that rank/geography/effective date already exists"
          : "Failed to add rate",
      ),
  });

  const valid = rank.trim() && geography.trim() && effectiveFrom && costRate !== "" && billRate !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add rate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add rate card entry</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Rank</Label>
            <Input value={rank} onChange={(e) => setRank(e.target.value)} placeholder="Senior Consultant" />
          </div>
          <div className="space-y-1.5">
            <Label>Geography</Label>
            <Input value={geography} onChange={(e) => setGeography(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective from</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cost rate ($/hr)</Label>
            <Input type="number" min={0} value={costRate} onChange={(e) => setCostRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bill rate ($/hr)</Label>
            <Input type="number" min={0} value={billRate} onChange={(e) => setBillRate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
