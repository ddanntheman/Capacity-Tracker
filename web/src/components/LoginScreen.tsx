import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authLinks } from "@/auth";

export function LoginScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-muted)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <img src="/logo.png" alt="Capacity Tracker logo" className="mb-2 h-16 w-16 rounded-full" />
          <CardTitle>Consulting Capacity Tracker</CardTitle>
          <CardDescription>Sign in with your work account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href={authLinks.login}>Sign in with Microsoft Entra ID</a>
          </Button>
          <p className="mt-4 text-xs text-[var(--color-muted-foreground)]">
            Access requires membership in a Capacity Tracker security group (Viewer, Editor, or Leadership).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
