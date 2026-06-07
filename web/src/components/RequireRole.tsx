import type { ReactNode } from "react";
import { useAuth } from "@/auth";
import type { AppRole } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();

  if (!hasRole(...roles)) {
    return (
      <div className="grid place-items-center py-20">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You do not have the required role to view this page.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-muted-foreground)]">
            Required: {roles.join(", ")}. Contact your administrator to request access.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
