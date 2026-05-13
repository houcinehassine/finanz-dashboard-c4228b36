import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useAccountBalances, useMonthlySummary, useTransactions, useCategories } from "@/lib/queries";
import { fmtEUR, fmtMonth, accountTypeLabel } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const balances = useAccountBalances();
  const monthly = useMonthlySummary();
  const txs = useTransactions();
  const cats = useCategories();

  const last6 = useMemo(() => {
    const m = monthly.data ?? [];
    return m.slice(-6).map((r) => ({ ...r, label: fmtMonth(r.month) }));
  }, [monthly.data]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return (monthly.data ?? []).find((r) => r.month.startsWith(key));
  }, [monthly.data]);

  const expenseByCat = useMemo(() => {
    if (!txs.data || !cats.data) return [];
    const now = new Date();
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const t of txs.data) {
      if (t.kind !== "expense") continue;
      const d = new Date(t.occurred_on);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      const cat = cats.data.find((c) => c.id === t.category_id);
      const key = cat?.id ?? "none";
      const cur = map.get(key) ?? { name: cat?.name ?? "Ohne Kategorie", value: 0, color: cat?.color ?? "#94a3b8" };
      cur.value += t.amount;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [txs.data, cats.data]);

  const totalBalance = (balances.data ?? []).filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Übersicht über deine Finanzen</p>
      </div>

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
            <TrendingUp className="h-4 w-4" /> Einnahmen (Monat)
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{fmtEUR(currentMonth?.income ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="h-4 w-4" /> Ausgaben (Monat)
          </div>
          <div className="mt-1 text-2xl font-bold text-red-600">{fmtEUR(currentMonth?.expense ?? 0)}</div>
        </Card>
      </div>

      {/* Account tiles */}
      <div>
        <h2 className="mb-2 text-sm font-medium">Konten</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(balances.data ?? []).filter((a) => !a.archived).map((a) => (
            <Card key={a.id} className="p-4">
              <div className="text-xs text-muted-foreground">{accountTypeLabel[a.type]}</div>
              <div className="mt-1 font-medium">{a.name}</div>
              <div className={`mt-2 text-xl font-semibold ${a.balance < 0 ? "text-red-600" : ""}`}>{fmtEUR(a.balance)}</div>
            </Card>
          ))}
          {balances.data && balances.data.filter((a) => !a.archived).length === 0 && (
            <Card className="col-span-full p-6 text-center text-sm text-muted-foreground">
              Noch keine Konten angelegt.
            </Card>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Einnahmen vs. Ausgaben (letzte 6 Monate)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last6}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtEUR(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Einnahmen" fill="#10b981" />
                <Bar dataKey="expense" name="Ausgaben" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium">Ausgaben nach Kategorie (aktueller Monat)</h3>
          <div className="h-64">
            {expenseByCat.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Keine Ausgaben in diesem Monat.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCat} dataKey="value" nameKey="name" outerRadius={80} label>
                    {expenseByCat.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtEUR(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
