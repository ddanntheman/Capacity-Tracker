import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Building2, Briefcase, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PageEntry {
  to: string;
  label: string;
}

interface Item {
  key: string;
  label: string;
  hint: string | null;
  to: string;
  group: "Pages" | "People" | "Clients" | "Projects";
}

const groupIcon = {
  Pages: <ArrowRight className="size-4" />,
  People: <Users className="size-4" />,
  Clients: <Building2 className="size-4" />,
  Projects: <Briefcase className="size-4" />,
};

export function CommandPalette({ pages }: { pages: PageEntry[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const doOpen = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else doOpen();
      }
    };
    const onOpen = () => doOpen();
    window.addEventListener("keydown", onKey);
    window.addEventListener("command-palette:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command-palette:open", onOpen);
    };
  }, [open]);


  const people = useQuery({ queryKey: ["people", false], queryFn: () => api.listPeople(false), enabled: open });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => api.listClients(), enabled: open });
  const projects = useQuery({ queryKey: ["projects", "all"], queryFn: () => api.listProjects(false), enabled: open });

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...pages.map((p) => ({ key: `page:${p.to}`, label: p.label, hint: null, to: p.to, group: "Pages" as const })),
      ...(people.data ?? []).map((p) => ({
        key: `person:${p.personId}`,
        label: p.displayName,
        hint: [p.rank, p.practice].filter(Boolean).join(" · ") || null,
        to: `/people/${p.personId}`,
        group: "People" as const,
      })),
      ...(clients.data ?? []).map((c) => ({
        key: `client:${c.clientId}`,
        label: c.name,
        hint: c.industry ?? null,
        to: `/clients/${c.clientId}`,
        group: "Clients" as const,
      })),
      ...(projects.data ?? []).map((p) => ({
        key: `project:${p.projectId}`,
        label: `${p.clientName} — ${p.projectName}`,
        hint: p.status,
        to: `/projects/${p.projectId}`,
        group: "Projects" as const,
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 12);
    const words = q.split(/\s+/);
    return all
      .filter((i) => words.every((w) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(w)))
      .slice(0, 12);
  }, [pages, people.data, clients.data, projects.data, query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (item: Item) => {
    setOpen(false);
    navigate(item.to);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border bg-[var(--color-card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && items[active]) go(items[active]);
            }}
            placeholder="Jump to a page, person, client, or project…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                i === active ? "bg-[var(--color-accent)]" : "",
              )}
            >
              <span className="text-[var(--color-muted-foreground)]">{groupIcon[item.group]}</span>
              <span className="flex-1 truncate font-medium">{item.label}</span>
              {item.hint && <span className="truncate text-xs text-[var(--color-muted-foreground)]">{item.hint}</span>}
              <span className="text-[10px] uppercase text-[var(--color-muted-foreground)]">{item.group}</span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-[var(--color-muted-foreground)]">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
