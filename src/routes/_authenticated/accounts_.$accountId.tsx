import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccountBalances, useTransactions, useCategories } from "@/lib/queries";
import { fmtEUR, fmtDate, fmtMonth, accountTypeLabel } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ChevronLeft, Wallet, CreditCard, Landmark, TrendingDown, Activity, Hash } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accounts_/$accountId")({
  component: AccountDetailPage,
});

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const balances = useAccountBalances();
  const cats = useCategories();
  const account = (balances.data ?? []).find((a) => a.id === accountId);
  const isLoanLike = account?.type === "loan" || account?.type === "credit_card" || account?.type === "darlehen";
  const txs = useTransactions(
    isLoanLike ? { loanAccountId: accountId } : { accountId },
  );

  const catById = useMemo(
    () => Object.fromEntries((cats.data ?? []).map((c) => [c.id, c])),
    [cats.data],
  );

  const rawList = txs.data ?? [];
  // Sign convention for this account's balance:
  // - Bank account (filtered by account_id): income +, expense -, transfer (source) -
  // - Loan-like (filtered by loan_account_id): expense + (Tilgung), income - (Auszahlung)
  // Transfers TO this account are handled separately below.
  const signFor = (t: { kind: "income" | "expense" | "transfer"; account_id: string; transfer_to_account_id: string | null }) => {
    if (t.kind === "transfer") {
      if (t.account_id === accountId) return -1; // outgoing
      if (t.transfer_to_account_id === accountId) return 1; // incoming
      return 0;
    }
    return isLoanLike ? (t.kind === "expense" ? 1 : -1) : (t.kind === "income" ? 1 : -1);
  };
  // Include transfers where this account is the destination
  const allTxs = useTransactions();
  const tList = useMemo(() => {
    const inbound = (allTxs.data ?? []).filter((t) => t.kind === "transfer" && t.transfer_to_account_id === accountId && t.account_id !== accountId);
    return [...rawList, ...inbound].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  }, [rawList, allTxs.data, accountId]);

  // Year stats
  const yearStats = useMemo(() => {
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setMonth(yearAgo.getMonth() - 12);
    const recent = tList.filter((t) => new Date(t.occurred_on) >= yearAgo && t.kind !== "transfer");
    const expenses = recent.filter((t) => t.kind === "expense");
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const months = new Set(recent.map((t) => t.occurred_on.slice(0, 7)));
    const avg = months.size > 0 ? totalExpense / months.size : 0;
    return { totalExpense, avg, months: months.size, count: recent.length };
  }, [tList]);

  // Saldo-Verlauf: monthly running balance backwards from current
  const series = useMemo(() => {
    if (!account) return [];
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: key });
    }
    const deltaByMonth = new Map<string, number>();
    for (const t of tList) {
      const k = t.occurred_on.slice(0, 7);
      deltaByMonth.set(k, (deltaByMonth.get(k) ?? 0) + signFor(t) * t.amount);
    }
    const endBal = new Map<string, number>();
    let running = account.balance;
    const sortedDesc = [...months].reverse();
    for (const m of sortedDesc) {
      endBal.set(m.key, running);
      const delta = deltaByMonth.get(m.key) ?? 0;
      running = running - delta;
    }
    return months.map((m) => ({ label: m.label, balance: endBal.get(m.key) ?? 0 }));
  }, [tList, account, isLoanLike]);

  if (!balances.data) {
    return <div className="text-sm text-muted-foreground">Lädt…</div>;
  }
  if (!account) {
    return (
      <div className="space-y-4">
        <Link to="/accounts" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />Zurück
        </Link>
        <Card className="p-6 text-center text-sm text-muted-foreground">Konto nicht gefunden.</Card>
      </div>
    );
  }

  const Icon = account.type === "credit_card" ? CreditCard : account.type === "loan" ? Landmark : Wallet;
  const balColor = account.balance < 0 ? "text-red-500" : "text-emerald-500";

  return (
    <div className="space-y-4">
      <Link to="/accounts" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="mr-1 h-4 w-4" />{accountTypeLabel[account.type]}
      </Link>

      {/* Header card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{accountTypeLabel[account.type]}</div>
              <h1 className="text-2xl font-bold leading-tight">{account.name}</h1>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Saldo</div>
            <div className={`text-2xl font-bold ${balColor}`}>{fmtEUR(account.balance)}</div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={<TrendingDown className="h-4 w-4" />} label="Ausgaben (Jahr)" value={fmtEUR(yearStats.totalExpense)} hint="12 Monate" valueClass="text-red-500" />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Ø Betrag" value={fmtEUR(yearStats.avg)} hint="monatlich" />
        <KpiCard icon={<Hash className="h-4 w-4" />} label="Anzahl" value={String(yearStats.count)} hint={`${yearStats.months} aktive Monate`} />
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Saldo-Verlauf</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtEUR(v)} />
              <Line type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs italic text-muted-foreground">
          Hinweis: Saldo-Verlauf basiert auf aktuellem Saldo und verknüpften Buchungen.
        </p>
      </Card>

      {/* Account-specific details */}
      {account.type === "credit_card" && account.credit_limit != null && (
        <Card className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Kreditkarte</div>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><div className="text-muted-foreground">Limit</div><div className="font-medium">{fmtEUR(account.credit_limit)}</div></div>
            <div><div className="text-muted-foreground">Genutzt</div><div className="font-medium">{fmtEUR(-Math.min(account.balance, 0))}</div></div>
            <div><div className="text-muted-foreground">Verfügbar</div><div className="font-medium">{fmtEUR(Math.max(0, account.credit_limit + Math.min(account.balance, 0)))}</div></div>
          </div>
        </Card>
      )}
      {account.type === "loan" && account.loan_principal != null && (
        <Card className="p-4">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Kredit</div>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <div><div className="text-muted-foreground">Ursprung</div><div className="font-medium">{fmtEUR(account.loan_principal)}</div></div>
            {account.loan_interest_rate != null && <div><div className="text-muted-foreground">Zinssatz</div><div className="font-medium">{account.loan_interest_rate}%</div></div>}
            {account.loan_term_months != null && <div><div className="text-muted-foreground">Laufzeit</div><div className="font-medium">{account.loan_term_months} Mon.</div></div>}
            <div><div className="text-muted-foreground">Restschuld</div><div className="font-medium">{fmtEUR(Math.max(0, account.loan_principal + Math.min(account.balance, 0)))}</div></div>
          </div>
        </Card>
      )}

      {/* Transactions */}
      <Card className="p-0 overflow-hidden">
        <div className="border-b px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground">Verknüpfte Buchungen</div>
        {tList.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Keine Buchungen gefunden</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Datum</th>
                  <th className="px-4 py-2 text-left font-medium">Typ</th>
                  <th className="px-4 py-2 text-left font-medium">Bezeichnung</th>
                  <th className="px-4 py-2 text-left font-medium">Kategorie</th>
                  <th className="px-4 py-2 text-right font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {tList.map((t) => {
                  const c = t.category_id ? catById[t.category_id] : null;
                  const sign = t.kind === "income" ? "+" : "−";
                  const cls = t.kind === "income" ? "text-emerald-500" : "text-red-500";
                  return (
                    <tr key={t.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDate(t.occurred_on)}</td>
                      <td className="px-4 py-2">{t.kind === "income" ? "Einnahme" : "Ausgabe"}</td>
                      <td className="px-4 py-2">{t.note || "—"}</td>
                      <td className="px-4 py-2">{c ? `${c.icon} ${c.name}` : "—"}</td>
                      <td className={`px-4 py-2 text-right font-medium ${cls}`}>{sign}{fmtEUR(t.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link to="/transactions">Alle Transaktionen</Link>
        </Button>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, hint, valueClass }: { icon: React.ReactNode; label: string; value: string; hint: string; valueClass?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`mt-1 text-xl font-bold ${valueClass ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}
