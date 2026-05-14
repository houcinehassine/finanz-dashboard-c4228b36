import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useAccountBalances, useMonthlySummary, useTransactions, useCategories } from "@/lib/queries";
import { fmtEUR, fmtMonth, accountTypeLabel } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { TrendingUp, TrendingDown, Wallet, CreditCard } from "lucide-react";
import { DateRangePicker, DEFAULT_RANGE, rangeLabel, rangeToFromTo, type RangeValue } from "@/components/DateRangePicker";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [range, setRange] = useState<RangeValue>(DEFAULT_RANGE);
  const { from, to } = useMemo(() => rangeToFromTo(range), [range]);

  const balances = useAccountBalances();
  const monthly = useMonthlySummary();
  const txs = useTransactions({ from, to });
  const cats = useCategories();

  const monthlyInRange = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of txs.data ?? []) {
      const key = t.occurred_on.slice(0, 7); // YYYY-MM
      const cur = map.get(key) ?? { month: key, income: 0, expense: 0 };
      if (t.kind === "income") cur.income += Number(t.amount);
      else cur.expense += Number(t.amount);
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, label: fmtMonth(r.month), net: r.income - r.expense }));
  }, [txs.data]);
  void monthly;

  const periodTotals = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of txs.data ?? []) {
      if (t.kind === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, net: income - expense };
  }, [txs.data]);

  const expenseByCat = useMemo(() => {
    if (!txs.data || !cats.data) return [];
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const t of txs.data) {
      if (t.kind !== "expense") continue;
      const cat = cats.data.find((c) => c.id === t.category_id);
      const key = cat?.id ?? "none";
      const cur = map.get(key) ?? { name: cat?.name ?? "Ohne Kategorie", value: 0, color: cat?.color ?? "#94a3b8" };
      cur.value += t.amount;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [txs.data, cats.data]);

  const creditCards = useMemo(
    () => (balances.data ?? []).filter((a) => !a.archived && a.type === "credit_card"),
    [balances.data],
  );

  const totalBalance = (balances.data ?? []).filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);
  const periodLabel = rangeLabel(range);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Übersicht über deine Finanzen</p>
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4" /> Gesamtsaldo
          </div>
          <div className="mt-1 text-2xl font-bold">{fmtEUR(totalBalance)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Einnahmen ({periodLabel})
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{fmtEUR(periodTotals.income)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="h-4 w-4" /> Ausgaben ({periodLabel})
          </div>
          <div className="mt-1 text-2xl font-bold text-red-600">{fmtEUR(periodTotals.expense)}</div>
        </Card>
      </div>

      {/* Account tiles */}
      <div>
        <h2 className="mb-2 text-sm font-medium">Konten</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(balances.data ?? []).filter((a) => !a.archived).map((a) => (
            <Link key={a.id} to="/accounts/$accountId" params={{ accountId: a.id }} className="block">
              <Card className="p-4 transition hover:border-primary/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-base">{a.icon || "🏦"}</span>
                  {accountTypeLabel[a.type]}
                </div>
                <div className="mt-1 font-medium">{a.name}</div>
                <div className={`mt-2 text-xl font-semibold ${a.balance < 0 ? "text-red-600" : ""}`}>{fmtEUR(a.balance)}</div>
              </Card>
            </Link>
          ))}
          {balances.data && balances.data.filter((a) => !a.archived).length === 0 && (
            <Card className="col-span-full p-6 text-center text-sm text-muted-foreground">
              Noch keine Konten angelegt.
            </Card>
          )}
        </div>
      </div>

      {/* Charts (stacked, full width for clarity) */}
      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Einnahmen vs. Ausgaben ({periodLabel})</h3>
            <div className="text-xs text-muted-foreground">
              Netto: <span className={periodTotals.net < 0 ? "text-red-500 font-semibold" : "text-emerald-500 font-semibold"}>{fmtEUR(periodTotals.net)}</span>
            </div>
          </div>
          <div className="h-80 w-full">
            {monthlyInRange.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Keine Daten im gewählten Zeitraum.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyInRange} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} tickMargin={8} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={50} />
                  <Tooltip formatter={(v: number) => fmtEUR(v)} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="income" name="Einnahmen" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" name="Ausgaben" fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Ausgaben nach Kategorie ({periodLabel})</h3>
            <div className="text-xs text-muted-foreground">
              Gesamt: <span className="font-semibold text-red-500">{fmtEUR(periodTotals.expense)}</span>
            </div>
          </div>
          {expenseByCat.length === 0 ? (
            <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
              Keine Ausgaben im gewählten Zeitraum.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByCat}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={2}
                      onClick={(d: any) => setActiveCat((p) => (p === d?.name ? null : d?.name))}
                    >
                      {expenseByCat.map((e, i) => (
                        <Cell
                          key={i}
                          fill={e.color}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                          opacity={activeCat && activeCat !== e.name ? 0.35 : 1}
                          style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtEUR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 self-center">
                {expenseByCat
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((e) => {
                    const pct = periodTotals.expense > 0 ? (e.value / periodTotals.expense) * 100 : 0;
                    const active = activeCat === e.name;
                    return (
                      <button
                        key={e.name}
                        type="button"
                        onClick={() => setActiveCat((p) => (p === e.name ? null : e.name))}
                        className={`flex w-full items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-left text-xs transition hover:bg-muted ${active ? "border-primary bg-muted" : "border-transparent"}`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.color }} />
                          <span className="truncate">{e.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {fmtEUR(e.value)} <span className="ml-1 text-[10px]">({pct.toFixed(0)}%)</span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Credit card utilization */}
      {creditCards.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4" /> Kreditkarten-Auslastung
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {creditCards.map((c) => {
              const limit = c.credit_limit ?? 0;
              const used = Math.max(0, -c.balance);
              const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
              const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";
              return (
                <Link key={c.id} to="/accounts/$accountId" params={{ accountId: c.id }} className="block">
                  <Card className="p-4 transition hover:border-primary/50">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.name}</div>
                    <div className="mt-1 text-sm font-medium">{fmtEUR(used)} / {fmtEUR(limit)}</div>
                    <div className="relative mt-2 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          innerRadius="75%"
                          outerRadius="100%"
                          data={[{ value: pct, fill: color }]}
                          startAngle={210}
                          endAngle={-30}
                        >
                          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "hsl(var(--muted))" }} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold">{pct.toFixed(0)}%</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">verwendet</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
