import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccounts, useCategories, useTransactions, type Transaction } from "@/lib/queries";
import { fmtEUR, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

function TransactionsPage() {
  const accounts = useAccounts();
  const categories = useCategories();
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const txs = useTransactions({
    accountId: filterAccount === "all" ? undefined : filterAccount,
    categoryId: filterCategory === "all" ? undefined : filterCategory,
  });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountById = useMemo(() => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const catById = useMemo(() => Object.fromEntries((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transaktionen</h1>
          <p className="text-sm text-muted-foreground">Einnahmen und Ausgaben</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="mr-2 h-4 w-4" />Neu</Button>
          </DialogTrigger>
          <TransactionDialog tx={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
        </Dialog>
      </div>

      <Card className="p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Konto</Label>
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Konten</SelectItem>
                {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Kategorie</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {(txs.data ?? []).map((t) => {
          const cat = t.category_id ? catById[t.category_id] : null;
          const acc = accountById[t.account_id];
          return (
            <Card key={t.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md text-lg"
                  style={{ backgroundColor: `${cat?.color ?? "#94a3b8"}20` }}
                >
                  {cat?.icon ?? (t.kind === "income" ? "💰" : "💸")}
                </div>
                <div>
                  <div className="font-medium">{cat?.name ?? "Ohne Kategorie"}</div>
                  <div className="text-xs text-muted-foreground">
                    {acc?.name ?? "—"} · {fmtDate(t.occurred_on)}{t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${t.kind === "income" ? "text-emerald-600" : "text-red-600"}`}>
                  {t.kind === "income" ? "+" : "−"}{fmtEUR(t.amount)}
                </span>
                <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          );
        })}
        {txs.data?.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Noch keine Transaktionen.</Card>
        )}
      </div>
    </div>
  );
}

function TransactionDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories();
  const [kind, setKind] = useState<Transaction["kind"]>("expense");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredCats = (categories.data ?? []).filter((c) => c.kind === kind);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !accountId) { toast.error("Bitte Konto wählen"); return; }
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId || null,
      kind,
      amount: Number(amount) || 0,
      occurred_on: date,
      note: note || null,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onClose(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Neue Transaktion</DialogTitle></DialogHeader>
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
          <Label>Notiz</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
