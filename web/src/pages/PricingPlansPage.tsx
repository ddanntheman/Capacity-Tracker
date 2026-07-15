import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/auth";
import type { PlanStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchesSearch, useSearchText, useUrlFilters } from "@/lib/urlFilters";

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft",
  activePursuit: "Active Pursuit",
  closedWon: "Closed/Won",
  closedLost: "Closed/Lost",
};

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const variant = status === "closedWon" ? "ok" : status === "closedLost" ? "secondary" : status === "activePursuit" ? "warn" : "outline";
  return <Badge variant={variant}>{PLAN_STATUS_LABELS[status]}</Badge>;
}

export default function PricingPlansPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("editor");

  const filters = useUrlFilters({ q: "", status: "all" });
  const search = useSearchText(filters);
  const statusFilter = filters.get("status");

  const { data: plans = [], isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => api.listPlans() });

  const rows = plans.filter(
    (p) =>
      matchesSearch(search.text, `${p.clientName} ${p.projectName} ${p.mdOwnerName ?? ""} ${p.practice ?? ""}`) &&
      (statusFilter === "all" || p.status === statusFilter),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pricing Plans</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Price pursuits with a weekly hours grid per role. Named internal resources on an Active Pursuit auto-book
            pipeline hours; winning locks the plan as the Original Plan.
          </p>
        </div>
        {canEdit && <CreatePlanDialog />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search client, project, owner…" value={search.text} onChange={(e) => search.onChange(e.target.value)} className="w-64" />
        <Select value={statusFilter} onValueChange={(v) => filters.set("status", v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="activePursuit">Active Pursuit</SelectItem>
            <SelectItem value="closedWon">Closed/Won</SelectItem>
            <SelectItem value="closedLost">Closed/Lost</SelectItem>
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
                  <TableHead>Client / Project</TableHead>
                  <TableHead>MD owner</TableHead>
                  <TableHead>Practice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead className="text-right">Roles</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.pricingPlanId}>
                    <TableCell className="font-medium">
                      <Link to={`/plans/${p.pricingPlanId}`} className="hover:underline">
                        {p.clientName} — {p.projectName}
                      </Link>
                    </TableCell>
                    <TableCell>{p.mdOwnerName ?? "—"}</TableCell>
                    <TableCell>{p.practice ?? "—"}</TableCell>
                    <TableCell>
                      <PlanStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-sm text-[var(--color-muted-foreground)]">
                      {p.startDate} → {p.endDate}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.lineItemCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.totalHours.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-[var(--color-muted-foreground)]">
                      No pricing plans yet.
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

function CreatePlanDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [mdOwnerId, setMdOwnerId] = useState("");
  const [practice, setPractice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: people = [] } = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false) });
  const { data: practices = [] } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() });

  const create = useMutation({
    mutationFn: () =>
      api.createPlan({
        clientName: clientName.trim(),
        projectName: projectName.trim(),
        mdOwnerId: mdOwnerId || null,
        practice: practice || null,
        startDate,
        endDate,
      }),
    onSuccess: (plan) => {
      toast.success("Pricing plan created");
      setOpen(false);
      navigate(`/plans/${plan.pricingPlanId}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError && e.status === 409 ? "That project already has a pricing plan" : "Failed to create plan"),
  });

  const valid = clientName.trim() && projectName.trim() && startDate && endDate && startDate <= endDate;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New pricing plan</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Project name</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>MD owner</Label>
            <Select value={mdOwnerId} onValueChange={setMdOwnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select owner" />
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
          <div className="space-y-1.5">
            <Label>Practice</Label>
            <Select value={practice} onValueChange={setPractice}>
              <SelectTrigger>
                <SelectValue placeholder="Select practice" />
              </SelectTrigger>
              <SelectContent>
                {practices
                  .filter((p) => !p.isArchived)
                  .map((p) => (
                    <SelectItem key={p.practiceId} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Engagement start</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Engagement end</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? "Creating…" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
