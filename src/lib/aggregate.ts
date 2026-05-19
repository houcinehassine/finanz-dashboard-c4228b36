// Dynamic time-bucket aggregation for charts.
// Picks a bucket granularity based on the range span, then groups data points.

export type Bucket = "day" | "5days" | "week" | "2weeks" | "month" | "quarter" | "halfyear" | "year";

export function pickBucket(fromISO: string, toISO: string): Bucket {
  const days = Math.max(
    1,
    Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86400000),
  );
  if (days <= 7) return "day";
  if (days <= 31) return "5days";
  if (days <= 93) return "week";
  if (days <= 186) return "2weeks";
  if (days <= 366) return "month";
  if (days <= 366 * 3) return "quarter";
  if (days <= 366 * 5) return "halfyear";
  return "year";
}

const MON_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Returns the bucket key (sortable string) and a human label for a given date.
export function bucketOf(dateISO: string, bucket: Bucket): { key: string; label: string } {
  const d = new Date(dateISO + (dateISO.length <= 10 ? "T00:00:00" : ""));
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (bucket) {
    case "day": {
      const key = d.toISOString().slice(0, 10);
      return { key, label: `${WD_DE[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(m + 1).padStart(2, "0")}` };
    }
    case "5days": {
      const start = new Date(y, m, 1);
      const dayIdx = Math.floor((d.getDate() - 1) / 5);
      const bDay = dayIdx * 5 + 1;
      const bStart = new Date(y, m, bDay);
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`;
      void start;
      return { key, label: `${String(bDay).padStart(2, "0")}.${String(m + 1).padStart(2, "0")}` };
    }
    case "week": {
      // ISO-week-ish: Monday of current week
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day - 1));
      const key = monday.toISOString().slice(0, 10);
      return { key, label: `${String(monday.getDate()).padStart(2, "0")}.${String(monday.getMonth() + 1).padStart(2, "0")}` };
    }
    case "2weeks": {
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day - 1));
      // align to bi-weekly anchor (week number parity)
      const epoch = new Date(2024, 0, 1);
      const weekNo = Math.floor((monday.getTime() - epoch.getTime()) / (7 * 86400000));
      if (weekNo % 2 !== 0) monday.setDate(monday.getDate() - 7);
      const key = monday.toISOString().slice(0, 10);
      return { key, label: `${String(monday.getDate()).padStart(2, "0")}.${String(monday.getMonth() + 1).padStart(2, "0")}` };
    }
    case "month": {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      return { key, label: `${MON_DE[m]} ${String(y).slice(2)}` };
    }
    case "quarter": {
      const q = Math.floor(m / 3) + 1;
      const key = `${y}-Q${q}`;
      return { key, label: `Q${q} ${y}` };
    }
    case "halfyear": {
      const h = m < 6 ? 1 : 2;
      const key = `${y}-H${h}`;
      return { key, label: `H${h} ${y}` };
    }
    case "year": {
      const key = String(y);
      return { key, label: String(y) };
    }
  }
}

// Generic group: for each input row pick the bucket and sum numeric fields.
export function groupByBucket<T extends { occurred_on: string }>(
  rows: T[],
  bucket: Bucket,
  pick: (t: T) => Record<string, number>,
): Array<{ key: string; label: string } & Record<string, number>> {
  const map = new Map<string, { key: string; label: string } & Record<string, number>>();
  for (const r of rows) {
    const b = bucketOf(r.occurred_on, bucket);
    const cur = map.get(b.key) ?? { key: b.key, label: b.label };
    const inc = pick(r);
    for (const k of Object.keys(inc)) {
      cur[k] = (cur[k] ?? 0) + inc[k];
    }
    map.set(b.key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}
