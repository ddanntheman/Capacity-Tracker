import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function parseSkills(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeSkills(skills: string[]): string {
  // De-dupe case-insensitively while preserving the first-seen casing.
  const seen = new Map<string, string>();
  for (const s of skills) {
    const key = s.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, s.trim());
  }
  return [...seen.values()].join(", ");
}

/**
 * Tag-style skills editor: current skills render as removable chips and new
 * ones are added by typing + Enter (or picking a suggestion). Suggestions are
 * the union of existing skills across the org so the vocabulary stays tidy
 * without a fixed taxonomy.
 */
export function SkillsInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a skill and press Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const lowerValue = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
  const matches = useMemo(() => {
    const d = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !lowerValue.has(s.toLowerCase()) && (d === "" || s.toLowerCase().includes(d)))
      .slice(0, 8);
  }, [draft, suggestions, lowerValue]);

  const add = (skill: string) => {
    const s = skill.trim();
    if (!s || lowerValue.has(s.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, s]);
    setDraft("");
  };

  const remove = (skill: string) => onChange(value.filter((v) => v !== skill));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((s) => (
          <Badge key={s} variant="secondary" className="gap-1">
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => remove(s)}
              className="rounded-sm hover:text-[var(--color-foreground)]"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {value.length === 0 && <span className="text-xs text-[var(--color-muted-foreground)]">No skills yet.</span>}
      </div>
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        list="skills-suggestions"
      />
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border px-2 py-0.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
