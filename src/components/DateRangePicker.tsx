import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarRange } from "lucide-react";

export type RangeUnit = "week" | "month" | "year";
export type RelativeRange = { mode: "relative"; amount: number; unit: RangeUnit };
export type AbsoluteRange = {
  mode: "absolute";
  fromYear: number;
  fromMonth: number; // 1-12
  toYear: number;
  toMonth: number; // 1-12
};
export type RangeValue = RelativeRange | AbsoluteRange;

export const DEFAULT_RANGE: RangeValue = { mode: "relative", amount: 1, unit: "month" };

const PRESETS: { label: string; value: RelativeRange }[] = [
  { label: "1 Woche",   value: { mode: "relative", amount: 1, unit: "week" } },
  { label: "1 Monat",   value: { mode: "relative", amount: 1, unit: "month" } },
  { label: "3 Monate",  value: { mode: "relative", amount: 3, unit: "month" } },
  { label: "6 Monate",  value: { mode: "relative", amount: 6, unit: "month" } },
  { label: "1 Jahr",    value: { mode: "relative", amount: 1, unit: "year" } },
];

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function rangeToFromTo(r: RangeValue): { from: string; to: string } {
  if (r.mode === "absolute") {
    const from = `${r.fromYear}-${pad(r.fromMonth)}-01`;
    const to = `${r.toYear}-${pad(r.toMonth)}-${pad(lastDayOfMonth(r.toYear, r.toMonth))}`;
    return { from, to };
  }
  const to = new Date();
  const from = new Date();
  if (r.unit === "week") from.setDate(from.getDate() - r.amount * 7);
  if (r.unit === "month") from.setMonth(from.getMonth() - r.amount);
  if (r.unit === "year") from.setFullYear(from.getFullYear() - r.amount);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function rangeLabel(r: RangeValue): string {
  if (r.mode === "absolute") {
    const a = `${MONTHS_DE[r.fromMonth - 1]} ${r.fromYear}`;
    const b = `${MONTHS_DE[r.toMonth - 1]} ${r.toYear}`;
    return a === b ? a : `${a} – ${b}`;
  }
  const u = r.unit === "week" ? (r.amount === 1 ? "Woche" : "Wochen")
          : r.unit === "month" ? (r.amount === 1 ? "Monat" : "Monate")
          : (r.amount === 1 ? "Jahr" : "Jahre");
  return `Letzte ${r.amount} ${u}`;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 8 + i);

export function DateRangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const isPreset = useMemo(
    () => value.mode === "relative" && PRESETS.some((p) => p.value.amount === value.amount && p.value.unit === value.unit),
    [value],
  );

  const switchToAbsolute = () => {
    const now = new Date();
    onChange({
      mode: "absolute",
      fromYear: now.getFullYear(),
      fromMonth: now.getMonth() + 1,
      toYear: now.getFullYear(),
      toMonth: now.getMonth() + 1,
    });
  };

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          Zeitraum
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => {
            const active = value.mode === "relative" && value.amount === p.value.amount && value.unit === p.value.unit;
            return (
              <Button key={p.label} type="button" variant={active ? "default" : "outline"} size="sm" onClick={() => onChange(p.value)}>
                {p.label}
              </Button>
            );
          })}
          <Button
            type="button"
            variant={value.mode === "absolute" ? "default" : "outline"}
            size="sm"
            onClick={switchToAbsolute}
          >
            Monat / Jahr
          </Button>
        </div>
        {value.mode === "relative" && !isPreset && (
          <span className="ml-auto text-xs text-muted-foreground">{rangeLabel(value)}</span>
        )}
      </div>

      {value.mode === "relative" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Eigene Dauer</span>
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
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Von</span>
            <div className="flex gap-2">
              <Select value={String(value.fromMonth)} onValueChange={(m) => onChange({ ...value, fromMonth: Number(m) })}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_DE.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(value.fromYear)} onValueChange={(y) => onChange({ ...value, fromYear: Number(y) })}>
                <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Bis</span>
            <div className="flex gap-2">
              <Select value={String(value.toMonth)} onValueChange={(m) => onChange({ ...value, toMonth: Number(m) })}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_DE.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(value.toYear)} onValueChange={(y) => onChange({ ...value, toYear: Number(y) })}>
                <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{rangeLabel(value)}</span>
        </div>
      )}
    </Card>
  );
}
