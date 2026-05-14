import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccounts, useCategories, useTransactions, type Transaction } from "@/lib/queries";
import { fmtEUR, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Pencil } from "lucide-react";
import { DateRangePicker, DEFAULT_RANGE, rangeToFromTo, type RangeValue } from "@/components/DateRangePicker";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

type ViewKind = "all" | "expense" | "income";

function TransactionsPage() {
  const accounts = useAccounts();
  const categories = useCategories();
  const [view, setView] = useState<ViewKind>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [range, setRange] = useState<RangeValue>(DEFAULT_RANGE);
  const { from, to } = useMemo(() => rangeToFromTo(range), [range]);
  const txs = useTransactions({
    accountId: filterAccount === "all" ? undefined : filterAccount,
    from,
    to,
  });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountById = useMemo(() => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const catById = useMemo(() => Object.fromEntries((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const filtered = useMemo(
    () => (txs.data ?? []).filter((t) => view === "all" || t.kind === view),
    [txs.data, view],
  );
  const totals = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of filtered) {
      if (t.kind === "income") income += Number(t.amount);
      else expense += Number(t.amount);
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["account_balances"] });
    qc.invalidateQueries({ queryKey: ["monthly_summary"] });
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); refresh(); }
  };

  const isExpense = view === "expense";
  const isIncome = view === "income";
  const title = view === "all" ? "Alle Transaktionen" : isExpense ? "Ausgaben" : "Einnahmen";
  const newLabel = isIncome ? "Neue Einnahme" : "Neue Ausgabe";
  const dialogDefaultKind: Transaction["kind"] = isIncome ? "income" : "expense";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Transaktionen</div>
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={(v) => setView(v as ViewKind)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle (Ein- & Ausgaben)</SelectItem>
              <SelectItem value="expense">Ausgaben</SelectItem>
              <SelectItem value="income">Einnahmen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Konten</SelectItem>
              {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}><Plus className="mr-2 h-4 w-4" />{newLabel}</Button>
            </DialogTrigger>
            <TransactionDialog key={editing?.id ?? "new"} tx={editing} defaultKind={dialogDefaultKind} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
          </Dialog>
        </div>
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Einnahmen</div>
          <div className="mt-2 text-2xl font-bold text-emerald-500">{fmtEUR(totals.income)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Ausgaben</div>
          <div className="mt-2 text-2xl font-bold text-red-500">{fmtEUR(totals.expense)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Netto</div>
          <div className={`mt-2 text-2xl font-bold ${totals.net < 0 ? "text-red-500" : "text-emerald-500"}`}>{fmtEUR(totals.net)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Anzahl</div>
          <div className="mt-2 text-2xl font-bold">{filtered.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">Datum</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Beschreibung</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Kategorie</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Verknüpft mit</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Betrag</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => {
              const cat = t.category_id ? catById[t.category_id] : null;
              const acc = accountById[t.account_id];
              const loan = t.loan_account_id ? accountById[t.loan_account_id] : null;
              return (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(t.occurred_on)}</TableCell>
                  <TableCell className="font-medium">{t.note ?? (cat?.name ?? "—")}</TableCell>
                  <TableCell>
                    {cat ? (
                      <Badge
                        variant="secondary"
                        style={{ backgroundColor: `${cat.color}20`, color: cat.color, borderColor: `${cat.color}40` }}
                      >
                        {cat.icon} {cat.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {acc && (
                        <span>
                          <span className="text-muted-foreground">Konto: </span>
                          <span className="font-medium">{acc.name}</span>
                        </span>
                      )}
                      {loan && (
                        <Badge variant="outline" className="w-fit">
                          {loan.type === "credit_card" ? "💳" : "🏦"} {loan.type === "credit_card" ? "Karte" : "Kredit"}: {loan.name}
                        </Badge>
                      )}
                      {!acc && !loan && "—"}
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${t.kind === "expense" ? "text-red-500" : "text-emerald-500"}`}>
                    {t.kind === "expense" ? "−" : "+"}{fmtEUR(Number(t.amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Noch keine {title.toLowerCase()}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function TransactionDialog({ tx, defaultKind, onClose }: { tx: Transaction | null; defaultKind?: Transaction["kind"]; onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories();
  const [kind, setKind] = useState<Transaction["kind"]>(tx?.kind ?? defaultKind ?? "expense");
  const [accountId, setAccountId] = useState<string>(tx?.account_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(tx?.category_id ?? "");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [date, setDate] = useState(tx?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(tx?.note ?? "");
  const [loanAccountId, setLoanAccountId] = useState<string>(tx?.loan_account_id ?? "none");
  const [busy, setBusy] = useState(false);

  const filteredCats = (categories.data ?? []).filter((c) => c.kind === kind);
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "credit_card");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !accountId) { toast.error("Bitte Konto wählen"); return; }
    setBusy(true);
    const payload = {
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId || null,
      loan_account_id: loanAccountId && loanAccountId !== "none" ? loanAccountId : null,
      kind,
      amount: Number(amount) || 0,
      occurred_on: date,
      note: note || null,
    };
    const { error } = tx?.id
      ? await supabase.from("transactions").update(payload).eq("id", tx.id)
      : await supabase.from("transactions").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onClose(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{tx?.id ? "Transaktion bearbeiten" : "Neue Transaktion"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Typ</Label>
          <Select value={kind} onValueChange={(v) => { setKind(v as Transaction["kind"]); setCategoryId(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Einnahme</SelectItem>
              <SelectItem value="expense">Ausgabe</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Konto</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
            <SelectContent>
              {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Kategorie</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
            <SelectContent>
              {filteredCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Betrag (€)</Label>
            <Input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Datum</Label>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Beschreibung</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <Label>Verknüpfter Kredit / Kreditkarte (optional)</Label>
          <Select value={loanAccountId} onValueChange={setLoanAccountId}>
            <SelectTrigger><SelectValue placeholder="Keiner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keiner</SelectItem>
              {loanAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.type === "credit_card" ? "💳" : "🏦"} {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {kind === "income"
              ? "Z.B. wenn diese Einnahme eine Kreditauszahlung ist."
              : "Z.B. wenn diese Ausgabe eine Rate / Tilgung für einen Kredit oder eine Kreditkarten-Zahlung ist."}
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
