import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Table filters stored in the URL query string so they survive navigation
 * and can be shared as links. Missing params fall back to the given default;
 * setting a param back to its default removes it from the URL.
 */
export function useUrlFilters(defaults: Record<string, string>) {
  const [searchParams, setSearchParams] = useSearchParams();

  const get = useCallback(
    (key: string) => searchParams.get(key) ?? defaults[key] ?? "",
    [searchParams, defaults],
  );

  const set = useCallback(
    (key: string, value: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === (defaults[key] ?? "")) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams, defaults],
  );

  return { get, set };
}

/**
 * Text state for a search box backed by a URL param. Typing updates local
 * state immediately (so no keystrokes are lost to router re-renders) and the
 * URL is synced after a short debounce.
 */
export function useSearchText(filters: ReturnType<typeof useUrlFilters>, key = "q") {
  const urlValue = filters.get(key);
  const [text, setText] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setRef = useRef(filters.set);
  useEffect(() => {
    setRef.current = filters.set;
  }, [filters.set]);

  const onChange = useCallback(
    (value: string) => {
      setText(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setRef.current(key, value), 250);
    },
    [key],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { text, onChange, value: text };
}

/** Case-insensitive contains match across the given fields. */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
}
