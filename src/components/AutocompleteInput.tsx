import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AutocompleteInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
  /** Max suggestions shown in dropdown. */
  maxResults?: number;
}

/**
 * Lightweight autocomplete: filters a list of suggestion strings
 * (case-insensitive substring match) and shows them in a popover.
 * No external API — works offline using addresses already in the system.
 */
export const AutocompleteInput = React.forwardRef<
  HTMLInputElement,
  AutocompleteInputProps
>(({ value, onChange, suggestions, maxResults = 8, className, ...rest }, ref) => {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const matches = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of suggestions) {
      const t = (s ?? "").trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      if (q && !key.includes(q)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= maxResults) break;
    }
    return out;
  }, [suggestions, value, maxResults]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={ref}
        {...rest}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            onChange(matches[active]);
            setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        autoComplete="off"
        className={className}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md max-h-56 overflow-auto">
          {matches.map((m, i) => (
            <button
              type="button"
              key={`${m}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(m);
                setOpen(false);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
AutocompleteInput.displayName = "AutocompleteInput";
