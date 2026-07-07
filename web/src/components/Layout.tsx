import { useEffect, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Briefcase, ScrollText, Gauge, ClipboardList, Building2, LineChart, Armchair, Network, Sparkles, Search } from "lucide-react";
import { authLinks, useAuth } from "@/auth";
import { CommandPalette } from "@/components/CommandPalette";
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
  { to: "/utilization", label: "Utilization Tracker", icon: <Gauge className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/resource-summary", label: "Resource Summary", icon: <ClipboardList className="size-4" />, roles: ["leadership"] },
  { to: "/executive-summary", label: "Executive Summary", icon: <LineChart className="size-4" />, roles: ["leadership"] },
  { to: "/bench", label: "Bench", icon: <Armchair className="size-4" />, roles: ["editor", "leadership"] },
  { to: "/recommend", label: "Recommendations", icon: <Sparkles className="size-4" />, roles: ["editor", "leadership"] },
  { to: "/people", label: "People", icon: <Users className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/practices", label: "Practices", icon: <Network className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/clients", label: "Clients", icon: <Building2 className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/projects", label: "Projects", icon: <Briefcase className="size-4" />, roles: ["viewer", "editor", "leadership"] },
  { to: "/audit", label: "Audit Log", icon: <ScrollText className="size-4" />, roles: ["leadership"] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { me, hasRole } = useAuth();
  const items = navItems.filter((i) => hasRole(...i.roles));
  const location = useLocation();

  useEffect(() => {
    const match = navItems.find((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`));
    document.title = match ? `${match.label} · Capacity Tracker` : "Capacity Tracker";
  }, [location.pathname]);

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("command-palette:open"))}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              aria-label="Open search"
            >
              <Search className="size-4" />
              <span className="hidden sm:inline">Search…</span>
              <kbd className="rounded border px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
            </button>
            <div className="flex items-center gap-2">
            {me?.roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r}
              </Badge>
            ))}
            </div>
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
      <CommandPalette pages={items.map((i) => ({ to: i.to, label: i.label }))} />
    </div>
  );
}
