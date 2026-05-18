import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAccountBalances, useTransactions, useCategories, useAccounts, type Transaction } from "@/lib/queries";
import { fmtEUR, fmtDate, accountTypeLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ChevronLeft, Wallet, CreditCard, Landmark, TrendingDown, Activity, Hash, Plus, Pencil, Copy, Trash2, Search, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { TransactionDialog } from "./transactions";
import { CsvImportDialog } from "@/components/CsvImportDialog";

export const Route = createFileRoute("/_authenticated/accounts_/$accountId")({
  component: AccountDetailPage,
});

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const balances = useAccountBalances();
  const cats = useCategories();
  const qc = useQueryClient();
  const { user } = useAuth();
  const account = (balances.data ?? []).find((a) => a.id === accountId);
  const isLoanLike = account?.type === "loan" || account?.type === "darlehen";
  const isCreditCard = account?.type === "credit_card";
  const txs = useTransactions(
    isLoanLike ? { loanAccountId: accountId } : isCreditCard ? { anyAccountId: accountId } : { accountId },
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const accountsAll = useAccounts();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["account_balances"] });
    qc.invalidateQueries({ queryKey: ["monthly_summary"] });
  };

  const onDelete = async (id: string) => {
    if (!confirm("Buchung wirklich löschen?")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); refresh(); }
  };

  const onDuplicate = async (t: Transaction) => {
    if (!user) return;
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      account_id: t.account_id,
      category_id: t.category_id,
      loan_account_id: t.loan_account_id,
      kind: t.kind,
      amount: t.amount,
      occurred_on: t.occurred_on,
      note: t.note,
      interest_amount: t.interest_amount,
      is_anyfin: t.is_anyfin,
      transfer_to_account_id: t.transfer_to_account_id,
    });
    if (error) toast.error(error.message);
    else { toast.success("Dupliziert"); refresh(); }
  };

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

  // Stats derived from ALL linked transactions (reactive to data)
  const stats = useMemo(() => {
    let positive = 0; // for bank: income; for loan-like: Tilgung (reduces debt)
    let negative = 0; // for bank: expense; for loan-like: Auszahlung (increases debt)
    const months = new Set<string>();
    for (const t of tList) {
      const s = signFor(t);
      if (s === 0) continue;
      const v = s * t.amount;
      if (v >= 0) positive += v;
      else negative += -v;
      months.add(t.occurred_on.slice(0, 7));
    }
    const total = positive + negative;
    const avg = months.size > 0 ? total / months.size : 0;
    return { positive, negative, avg, months: months.size, count: tList.length };
  }, [tList, isLoanLike, accountId]);

  // Saldo-Verlauf: monthly running balance backwards from current
  const series = useMemo(() => {
    if (!account) return [];
    const dates = tList.map((t) => t.occurred_on).sort();
    const firstDate = dates[0] ?? new Date().toISOString().slice(0, 10);
    const lastDate = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);
    const fromD = new Date(firstDate + "T00:00:00");
    const toD = new Date(lastDate + "T00:00:00");
    const months: { key: string; label: string }[] = [];
    const cursor = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
    const end = new Date(toD.getFullYear(), toD.getMonth(), 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: key });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (months.length === 0) return [];
    const deltaByMonth = new Map<string, number>();
    for (const t of tList) {
      const k = t.occurred_on.slice(0, 7);
      deltaByMonth.set(k, (deltaByMonth.get(k) ?? 0) + signFor(t) * t.amount);
    }
    // Walk back from current balance through months AFTER the range to get end-of-range balance
    const nowKey = new Date().toISOString().slice(0, 7);
    let running = account.balance;
    const lastKey = months[months.length - 1].key;
    if (nowKey > lastKey) {
      const c = new Date();
      const cur = new Date(c.getFullYear(), c.getMonth(), 1);
      while (true) {
        const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        if (k <= lastKey) break;
        running -= deltaByMonth.get(k) ?? 0;
        cur.setMonth(cur.getMonth() - 1);
      }
    }
    const endBal = new Map<string, number>();
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

      {/* KPIs — derived from linked transactions */}
      <div className="grid gap-3 sm:grid-cols-3">
        {isLoanLike ? (
          <>
            <KpiCard icon={<TrendingDown className="h-4 w-4" />} label="Tilgung gesamt" value={fmtEUR(stats.positive)} hint={`${stats.months} aktive Monate`} valueClass="text-emerald-500" />
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Auszahlung / Belastung" value={fmtEUR(stats.negative)} hint="aus Buchungen" valueClass="text-red-500" />
            <KpiCard icon={<Hash className="h-4 w-4" />} label="Buchungen" value={String(stats.count)} hint={`Ø ${fmtEUR(stats.avg)} / Monat`} />
          </>
        ) : (
          <>
            <KpiCard icon={<TrendingDown className="h-4 w-4" />} label="Einnahmen" value={fmtEUR(stats.positive)} hint={`${stats.months} aktive Monate`} valueClass="text-emerald-500" />
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Ausgaben" value={fmtEUR(stats.negative)} hint="aus Buchungen" valueClass="text-red-500" />
            <KpiCard icon={<Hash className="h-4 w-4" />} label="Buchungen" value={String(stats.count)} hint={`Ø ${fmtEUR(stats.avg)} / Monat`} />
          </>
        )}
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

      {/* Toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buchungen durchsuchen…"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => exportCsv(filteredList, catById, accountsAll.data ?? [], account.name)}>
            <Download className="mr-2 h-4 w-4" />Exportieren
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />CSV Importieren
          </Button>
        </div>
      </Card>

      {/* Transactions */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Verknüpfte Buchungen {search && <span className="ml-1 normal-case">({filteredList.length} von {tList.length})</span>}
          </div>
          <Button size="sm" onClick={() => { setEditingTx(null); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />Neue Buchung
          </Button>
        </div>
        {filteredList.length === 0 ? (
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
                  <th className="px-4 py-2 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((t) => {
                  const c = t.category_id ? catById[t.category_id] : null;
                  const isTransfer = t.kind === "transfer";
                  const sign = isTransfer ? "" : t.kind === "income" ? "+" : "−";
                  const cls = isTransfer ? "text-muted-foreground" : t.kind === "income" ? "text-emerald-500" : "text-red-500";
                  const typeLbl = isTransfer ? "Umbuchung" : t.kind === "income" ? "Einnahme" : "Ausgabe";
                  return (
                    <tr key={t.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDate(t.occurred_on)}</td>
                      <td className="px-4 py-2">{typeLbl}</td>
                      <td className="px-4 py-2">{t.note || "—"}</td>
                      <td className="px-4 py-2">{c ? `${c.icon} ${c.name}` : "—"}</td>
                      <td className={`px-4 py-2 text-right font-medium ${cls}`}>{sign}{fmtEUR(t.amount)}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingTx(t); setDialogOpen(true); }} title="Bearbeiten"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => onDuplicate(t)} title="Duplizieren"><Copy className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => onDelete(t.id)} title="Löschen"><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingTx(null); }}>
        <TransactionDialog
          key={editingTx?.id ?? "new"}
          tx={editingTx}
          defaultKind={isLoanLike ? "expense" : "expense"}
          defaultAccountId={isLoanLike ? undefined : accountId}
          defaultLoanAccountId={isLoanLike ? accountId : undefined}
          onClose={() => { setDialogOpen(false); setEditingTx(null); refresh(); }}
        />
      </Dialog>

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
