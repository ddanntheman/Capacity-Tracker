import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "capacity-tracker-theme";

function preferredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function initTheme(): void {
  applyTheme(preferredTheme());
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(preferredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return {
    theme,
    toggle: () =>
      setTheme((t) => {
        const next: Theme = t === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        return next;
      }),
  };
}
