import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarRange } from "lucide-react";

export type RangeUnit = "week" | "month" | "year";
export type RangeValue = { amount: number; unit: RangeUnit };

export const DEFAULT_RANGE: RangeValue = { amount: 1, unit: "month" };

const PRESETS: { label: string; value: RangeValue }[] = [
  { label: "1 Woche",   value: { amount: 1, unit: "week" } },
  { label: "1 Monat",   value: { amount: 1, unit: "month" } },
  { label: "3 Monate",  value: { amount: 3, unit: "month" } },
  { label: "6 Monate",  value: { amount: 6, unit: "month" } },
  { label: "1 Jahr",    value: { amount: 1, unit: "year" } },
];

export function rangeToFromTo(r: RangeValue): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (r.unit === "week") from.setDate(from.getDate() - r.amount * 7);
  if (r.unit === "month") from.setMonth(from.getMonth() - r.amount);
  if (r.unit === "year") from.setFullYear(from.getFullYear() - r.amount);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function rangeLabel(r: RangeValue): string {
  const u = r.unit === "week" ? (r.amount === 1 ? "Woche" : "Wochen")
          : r.unit === "month" ? (r.amount === 1 ? "Monat" : "Monate")
          : (r.amount === 1 ? "Jahr" : "Jahre");
  return `Letzte ${r.amount} ${u}`;
}

export function DateRangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const isPreset = useMemo(
    () => PRESETS.some((p) => p.value.amount === value.amount && p.value.unit === value.unit),
    [value],
  );

  return (
    <Card className="flex flex-wrap items-center gap-3 p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        Zeitraum
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const active = value.amount === p.value.amount && value.unit === p.value.unit;
          return (
            <Button
              key={p.label}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(p.value)}
            >
              {p.label}
            </Button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Eigene</span>
        <Input
          type="number"
          min={1}
          max={120}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: Math.max(1, Number(e.target.value) || 1) })}
          className="h-9 w-20"
        />
        <Select value={value.unit} onValueChange={(u) => onChange({ ...value, unit: u as RangeUnit })}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Wochen</SelectItem>
            <SelectItem value="month">Monate</SelectItem>
            <SelectItem value="year">Jahre</SelectItem>
          </SelectContent>
        </Select>
        {!isPreset && <span className="text-xs text-muted-foreground">{rangeLabel(value)}</span>}
      </div>
    </Card>
  );
}
