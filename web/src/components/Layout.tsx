import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { CalendarRange, LayoutDashboard, Users, Briefcase, ScrollText } from "lucide-react";
import { authLinks, useAuth } from "@/auth";
import type { AppRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-4" />, roles: ["leadership"] },
  { to: "/allocations", label: "Allocations", icon: <CalendarRange className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/people", label: "People", icon: <Users className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/projects", label: "Projects", icon: <Briefcase className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/audit", label: "Audit Log", icon: <ScrollText className="size-4" />, roles: ["leadership"] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { me, hasRole } = useAuth();
  const items = navItems.filter((i) => hasRole(...i.roles));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r bg-[var(--color-card)]">
        <div className="flex h-14 items-center px-5 font-semibold">Capacity Tracker</div>
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]",
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2">
            {me?.roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--color-muted-foreground)]">{me?.displayName}</span>
            <Button asChild variant="outline" size="sm">
              <a href={authLinks.logout}>Sign out</a>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
