import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const entityTypes = ["", "Person", "Project", "Allocation"];

export default function AuditPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entityType, setEntityType] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["audit", from, to, entityType],
    queryFn: () => api.auditLog({ from: from || undefined, to: to || undefined, entityType: entityType || undefined, take: 200 }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">Append-only record of every write. Actors shown by Entra OID.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Entity</Label>
              <Select value={entityType || "all"} onValueChange={(v) => setEntityType(v === "all" ? "" : v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="All entities" />
                </SelectTrigger>
                <SelectContent>
                  {entityTypes.map((t) => (
                    <SelectItem key={t || "all"} value={t || "all"}>
                      {t || "All entities"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When (UTC)</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Old</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>By (OID)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.auditLogId}>
                    <TableCell className="whitespace-nowrap">{new Date(row.changedAt).toISOString().replace("T", " ").slice(0, 19)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.entityType}</Badge>
                      <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">{row.entityId.slice(0, 8)}</span>
                    </TableCell>
                    <TableCell>{row.fieldChanged}</TableCell>
                    <TableCell className="max-w-32 truncate text-[var(--color-muted-foreground)]">{row.oldValue ?? "—"}</TableCell>
                    <TableCell className="max-w-32 truncate">{row.newValue ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.changedBy.slice(0, 8)}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-[var(--color-muted-foreground)]">
                      No audit entries for the selected filters.
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
