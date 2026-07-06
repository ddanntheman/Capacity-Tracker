import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

interface InlineBaseProps {
  display: string;
  disabled?: boolean;
  className?: string;
}

function DisplayButton({ display, disabled, className, onEdit }: InlineBaseProps & { onEdit: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onEdit}
      className={cn(
        "group inline-flex w-full items-center gap-1 rounded px-1 py-0.5 text-left",
        !disabled && "enabled:hover:bg-[var(--color-accent)]",
        className,
      )}
    >
      <span className="truncate">{display}</span>
      {!disabled && <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />}
    </button>
  );
}

/** Click-to-edit text/number cell. Enter or blur saves; Escape cancels. */
export function InlineInput({
  value,
  display,
  onSave,
  type = "text",
  min,
  max,
  step,
  disabled,
  className,
  inputClassName,
}: {
  value: string;
  display: string;
  onSave: (next: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number | string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <DisplayButton
        display={display}
        disabled={disabled}
        className={className}
        onEdit={() => {
          setDraft(value);
          setEditing(true);
        }}
      />
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  return (
    <Input
      ref={ref}
      type={type}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className={cn("h-7 px-1.5 py-0 text-sm", inputClassName)}
    />
  );
}

/** Click-to-edit select cell. Choosing an option saves immediately. */
export function InlineSelect({
  value,
  display,
  options,
  onSave,
  allowNone,
  noneLabel = "—",
  disabled,
  className,
}: {
  value: string;
  display: string;
  options: { value: string; label: string }[];
  onSave: (next: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return <DisplayButton display={display} disabled={disabled} className={className} onEdit={() => setEditing(true)} />;
  }

  return (
    <Select
      defaultOpen
      value={value || NONE}
      onValueChange={(v) => {
        setEditing(false);
        const next = v === NONE ? "" : v;
        if (next !== value) onSave(next);
      }}
      onOpenChange={(open) => {
        if (!open) setEditing(false);
      }}
    >
      <SelectTrigger className="h-7 w-full px-1.5 py-0 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
