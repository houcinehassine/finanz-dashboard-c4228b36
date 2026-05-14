import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccountBalances, useTransactions, useCategories } from "@/lib/queries";
import { fmtEUR, fmtMonth, accountTypeLabel } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar, PolarAngleAxis, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, Landmark } from "lucide-react";
import { DateRangePicker, DEFAULT_RANGE, rangeLabel, rangeToFromTo, type RangeValue } from "@/components/DateRangePicker";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [range, setRange] = useState<RangeValue>(DEFAULT_RANGE);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const now = new Date();
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState<string>(String(now.getMonth() + 1));
  const { from, to } = useMemo(() => {
    if (filterYear !== "all") {
      const y = Number(filterYear);
      if (filterMonth !== "all") {
        const m = Number(filterMonth);
        const last = new Date(y, m, 0).getDate();
        const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
        return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
      }
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    if (filterMonth !== "all") {
      const m = Number(filterMonth);
      const y = now.getFullYear();
      const last = new Date(y, m, 0).getDate();
      const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
    }
    return rangeToFromTo(range);
  }, [range, filterYear, filterMonth]);
  const ymActive = filterYear !== "all" || filterMonth !== "all";
  const YEARS = useMemo(() => {
    const cy = now.getFullYear();
    return Array.from({ length: 11 }, (_, i) => cy - 8 + i);
  }, []);
  const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

  const balances = useAccountBalances();
  const txs = useTransactions({ from, to });
  const allTxs = useTransactions();
  const cats = useCategories();

  const liquidIds = useMemo(
    () => new Set((balances.data ?? []).filter((a) => a.is_liquid !== false).map((a) => a.id)),
    [balances.data],
  );
  const liquidTxs = useMemo(
    () => (txs.data ?? []).filter((t) => t.kind !== "transfer" && liquidIds.has(t.account_id)),
    [txs.data, liquidIds],
  );

  const monthlyInRange = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of liquidTxs) {
      const key = t.occurred_on.slice(0, 7);
      const cur = map.get(key) ?? { month: key, income: 0, expense: 0 };
      if (t.kind === "income") cur.income += Number(t.amount);
      else if (t.kind === "expense") cur.expense += Number(t.amount);
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({ ...r, label: fmtMonth(r.month), net: r.income - r.expense }));
  }, [liquidTxs]);

  const periodTotals = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of liquidTxs) {
      if (t.kind === "income") income += t.amount;
      else if (t.kind === "expense") expense += t.amount;
    }
    return { income, expense, net: income - expense };
  }, [liquidTxs]);

  const expenseByCat = useMemo(() => {
    if (!cats.data) return [];
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const t of liquidTxs) {
      if (t.kind !== "expense") continue;
      const cat = cats.data.find((c) => c.id === t.category_id);
      const key = cat?.id ?? "none";
      const cur = map.get(key) ?? { name: cat?.name ?? "Ohne Kategorie", value: 0, color: cat?.color ?? "#94a3b8" };
      cur.value += t.amount;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [liquidTxs, cats.data]);

  const activeAccounts = useMemo(
    () => (balances.data ?? []).filter((a) => !a.archived),
    [balances.data],
  );
  const bankAccounts = useMemo(
    () => activeAccounts.filter((a) => a.type === "checking" || a.type === "savings"),
    [activeAccounts],
  );
  const creditCards = useMemo(
    () => activeAccounts.filter((a) => a.type === "credit_card"),
    [activeAccounts],
  );
  const loans = useMemo(
    () => activeAccounts.filter((a) => a.type === "loan"),
    [activeAccounts],
  );

  const totalBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const savingsRate = periodTotals.income > 0 ? (periodTotals.net / periodTotals.income) * 100 : 0;
  const remainingDebt = loans.reduce((s, a) => s + Math.max(0, -a.balance), 0);

  const cardTotalLimit = creditCards.reduce((s, c) => s + (c.credit_limit ?? 0), 0);
  const cardTotalUsed = creditCards.reduce((s, c) => s + Math.max(0, -c.balance), 0);
  const cardPct = cardTotalLimit > 0 ? Math.min(100, (cardTotalUsed / cardTotalLimit) * 100) : 0;
  const cardColor = cardPct >= 90 ? "#ef4444" : cardPct >= 70 ? "#f59e0b" : "#10b981";

  const periodLabel = rangeLabel(range);

  const loanSeries = useMemo<{
    keys: { id: string; name: string }[];
    data: Array<Record<string, number | string>>;
  }>(() => {
    if (loans.length === 0 || !allTxs.data) return { keys: [], data: [] };
    const loanIds = new Set(loans.map((l) => l.id));
    const relevant = allTxs.data
      .filter((t) =>
        loanIds.has(t.account_id) ||
        (t.loan_account_id && loanIds.has(t.loan_account_id)) ||
        (t.kind === "transfer" && t.transfer_to_account_id && loanIds.has(t.transfer_to_account_id))
      )
      .slice()
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    if (relevant.length === 0) return { keys: [], data: [] };

    const remaining = new Map<string, number>();
    for (const l of loans) remaining.set(l.id, Math.max(0, -l.starting_balance));

    const months = new Set<string>();
    for (const t of relevant) months.add(t.occurred_on.slice(0, 7));
    const sortedMonths = Array.from(months).sort();

    const points: Array<Record<string, number | string>> = [];
    let idx = 0;
    for (const month of sortedMonths) {
      while (idx < relevant.length && relevant[idx].occurred_on.slice(0, 7) <= month) {
        const t = relevant[idx];
        if (loanIds.has(t.account_id)) {
          const cur = remaining.get(t.account_id) ?? 0;
          if (t.kind === "transfer") {
            // outgoing transfer from loan = increases debt
            remaining.set(t.account_id, Math.max(0, cur + t.amount));
          } else {
            remaining.set(t.account_id, Math.max(0, cur + (t.kind === "expense" ? t.amount : -t.amount)));
          }
        }
        if (t.loan_account_id && loanIds.has(t.loan_account_id)) {
          const cur = remaining.get(t.loan_account_id) ?? 0;
          remaining.set(t.loan_account_id, Math.max(0, cur - t.amount));
        }
        if (t.kind === "transfer" && t.transfer_to_account_id && loanIds.has(t.transfer_to_account_id)) {
          // incoming transfer to loan = principal payment
          const cur = remaining.get(t.transfer_to_account_id) ?? 0;
          remaining.set(t.transfer_to_account_id, Math.max(0, cur - t.amount));
        }
        idx++;
      }
      const point: Record<string, number | string> = { month, label: fmtMonth(month + "-01") };
      for (const l of loans) point[l.id] = remaining.get(l.id) ?? 0;
      points.push(point);
    }

    return {
      keys: loans.map((l) => ({ id: l.id, name: l.name })),
      data: points,
    };
  }, [loans, allTxs.data, from, to]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Übersicht über deine Finanzen</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className={ymActive ? "opacity-60" : ""}>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        <Card className="space-y-3 p-3">
          <div className="text-sm text-muted-foreground">Monat / Jahr</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Monate</SelectItem>
                {MONTHS_DE.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Jahre</SelectItem>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {ymActive && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterYear("all"); setFilterMonth("all"); }}>
                Zurücksetzen
              </Button>
            )}
          </div>
          {ymActive && (
            <p className="text-xs text-muted-foreground">Überschreibt den Zeitraum-Filter.</p>
          )}
        </Card>
      </div>

      {/* KPI row — 5 cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Gesamtsaldo"
          value={fmtEUR(totalBalance)}
          sub={`${bankAccounts.length} Bankkonten`}
          icon={<Wallet className="h-4 w-4" />}
          accent="text-foreground"
        />
        <KpiCard
          label={`Einnahmen (${periodLabel})`}
          value={fmtEUR(periodTotals.income)}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-emerald-500"
        />
        <KpiCard
          label={`Ausgaben (${periodLabel})`}
          value={fmtEUR(periodTotals.expense)}
          icon={<TrendingDown className="h-4 w-4" />}
          accent="text-red-500"
        />
        <KpiCard
          label="Sparquote"
          value={`${savingsRate.toFixed(0)}%`}
          sub={fmtEUR(periodTotals.net)}
          icon={<PiggyBank className="h-4 w-4" />}
          accent={savingsRate < 0 ? "text-red-500" : "text-emerald-500"}
        />
        <KpiCard
          label="Restschuld"
          value={fmtEUR(remainingDebt)}
          sub={`${loans.length} Aktive Kredite`}
          icon={<Landmark className="h-4 w-4" />}
          accent={remainingDebt > 0 ? "text-red-500" : "text-foreground"}
        />
      </div>

      {/* Row 2: Einnahmen vs Ausgaben (2/3) + Kreditkarten-Auslastung (1/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Einnahmen vs. Ausgaben</div>
              <div className="text-sm font-medium">{periodLabel}</div>
            </div>
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
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Kreditkarten-Auslastung</div>
            <div className="text-sm font-medium">{fmtEUR(cardTotalUsed)} / {fmtEUR(cardTotalLimit)}</div>
          </div>
          <div className="relative h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="75%"
                outerRadius="100%"
                data={[{ value: cardPct, fill: cardColor }]}
                startAngle={210}
                endAngle={-30}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "hsl(var(--muted))" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold">{cardPct.toFixed(0)}%</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">verwendet</div>
            </div>
          </div>
          {creditCards.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {creditCards.map((c) => {
                const limit = c.credit_limit ?? 0;
                const used = Math.max(0, -c.balance);
                const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                return (
                  <Link key={c.id} to="/accounts/$accountId" params={{ accountId: c.id }} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition hover:border-primary/50 hover:bg-muted">
                    <span className="flex items-center gap-2 truncate">
                      <CreditCard className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{fmtEUR(used)} / {fmtEUR(limit)} <span className="ml-1">({pct.toFixed(0)}%)</span></span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Row 3: Ausgaben nach Kategorie (1/3) + Bankkonten (2/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ausgaben nach Kategorie</div>
            <div className="text-xs font-semibold text-red-500">{fmtEUR(periodTotals.expense)}</div>
          </div>
          {expenseByCat.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Keine Ausgaben.
            </div>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByCat}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={95}
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
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {expenseByCat
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map((e) => {
                    const active = activeCat === e.name;
                    return (
                      <button
                        key={e.name}
                        type="button"
                        onClick={() => setActiveCat((p) => (p === e.name ? null : e.name))}
                        className={`flex items-center gap-1.5 rounded transition ${active ? "font-semibold" : ""}`}
                      >
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.color }} />
                        <span className="truncate">{e.name}</span>
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Bankkonten</div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          {bankAccounts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Noch keine Bankkonten.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {bankAccounts.map((a) => (
                <Link key={a.id} to="/accounts/$accountId" params={{ accountId: a.id }} className="block">
                  <div className="rounded-md border p-3 transition hover:border-primary/50 hover:bg-muted">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{accountTypeLabel[a.type]}</span>
                    </div>
                    <div className={`mt-1 text-lg font-semibold ${a.balance < 0 ? "text-red-500" : ""}`}>{fmtEUR(a.balance)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Row 4: Kredite + Verlauf */}
      {loans.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Kredite</div>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {loans.map((l) => {
                const principal = l.loan_principal ?? Math.abs(l.starting_balance);
                const remaining = Math.max(0, -l.balance);
                const paid = Math.max(0, principal - remaining);
                const pct = principal > 0 ? Math.min(100, (paid / principal) * 100) : 0;
                return (
                  <Link key={l.id} to="/accounts/$accountId" params={{ accountId: l.id }} className="block">
                    <div className="rounded-md border p-3 transition hover:border-primary/50 hover:bg-muted">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{l.name}</div>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{accountTypeLabel[l.type]}</span>
                      </div>
                      <div className="mt-1 text-lg font-semibold text-red-500">{fmtEUR(remaining)}</div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>Getilgt {fmtEUR(paid)}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 lg:col-span-2">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Verlauf der Kredite</div>
                <div className="text-sm font-medium">Restschuld über Zeit</div>
              </div>
              <div className="text-xs text-muted-foreground">Gesamt: <span className="font-semibold text-red-500">{fmtEUR(remainingDebt)}</span></div>
            </div>
            <div className="h-80 w-full">
              {loanSeries.data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Noch keine Kreditbewegungen.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loanSeries.data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid stroke="hsl(var(--muted))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} tickMargin={8} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={50} />
                    <Tooltip formatter={(v: number) => fmtEUR(v)} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {loanSeries.keys.map((k, i) => (
                      <Line
                        key={k.id}
                        type="monotone"
                        dataKey={k.id}
                        name={k.name}
                        stroke={LOAN_COLORS[i % LOAN_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

const LOAN_COLORS = ["#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#10b981"];

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = "text-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        {icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
