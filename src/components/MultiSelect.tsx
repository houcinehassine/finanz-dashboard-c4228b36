import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";

export type MultiSelectOption = { value: string; label: string };

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  className,
}: {
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.size;
  const label =
    count === 0
      ? placeholder
      : count === 1
        ? options.find((o) => selected.has(o.value))?.label ?? `${count} ausgewählt`
        : `${count} ausgewählt`;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 justify-between gap-2 font-normal ${className ?? ""}`}>
          <span className={count === 0 ? "text-muted-foreground" : ""}>{label}</span>
          <div className="flex items-center gap-1">
            {count > 0 && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(new Set());
                }}
              />
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <div className="max-h-72 overflow-auto">
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Optionen</div>
          )}
          {options.map((o) => {
            const checked = selected.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
