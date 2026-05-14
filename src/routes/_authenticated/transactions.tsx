import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAccounts, useCategories, useTransactions, type Transaction } from "@/lib/queries";
import { fmtEUR, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Pencil, X, Copy } from "lucide-react";
import { DateRangePicker, DEFAULT_RANGE, rangeToFromTo, type RangeValue } from "@/components/DateRangePicker";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

type ViewKind = "all" | "expense" | "income" | "transfer";

function TransactionsPage() {
  const accounts = useAccounts();
  const categories = useCategories();
  const [view, setView] = useState<ViewKind>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [range, setRange] = useState<RangeValue>({ mode: "relative", amount: 3, unit: "month" });
  const now = new Date();
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");
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
  const txs = useTransactions({
    accountId: filterAccount === "all" ? undefined : filterAccount,
    categoryId: filterCategory === "all" ? undefined : filterCategory,
    from,
    to,
  });
  const YEARS = useMemo(() => {
    const cy = now.getFullYear();
    return Array.from({ length: 11 }, (_, i) => cy - 8 + i);
  }, []);
  const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
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
    let income = 0, expense = 0, transfers = 0;
    for (const t of filtered) {
      if (t.kind === "income") income += Number(t.amount);
      else if (t.kind === "expense") expense += Number(t.amount);
      else transfers += Number(t.amount);
    }
    return { income, expense, transfers, net: income - expense };
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const filteredIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(filteredIds);
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (ids.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filteredIds]);
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(filteredIds) : new Set());
  const clearSelection = () => setSelected(new Set());
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const onBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const { error } = await supabase.from("transactions").delete().in("id", selectedIds);
    if (error) toast.error(error.message);
    else { toast.success(`${selectedIds.length} gelöscht`); clearSelection(); refresh(); }
    setBulkDeleteOpen(false);
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
            <SelectTrigger className="w-auto min-w-[7rem] gap-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="expense">Ausgaben</SelectItem>
              <SelectItem value="income">Einnahmen</SelectItem>
              <SelectItem value="transfer">Umbuchungen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="w-auto min-w-[7rem] gap-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Konten</SelectItem>
              {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-auto min-w-[7rem] gap-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {(categories.data ?? [])
                .filter((c) => view === "all" || c.kind === view)
                .map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-auto min-w-[7rem] gap-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Monate</SelectItem>
              {MONTHS_DE.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-auto min-w-[7rem] gap-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Jahre</SelectItem>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
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

      <div className="space-y-2">
        <div className={ymActive ? "opacity-60" : ""}>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        {ymActive && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Monat/Jahr-Filter überschreibt den Zeitraum.</span>
            <Button variant="ghost" size="sm" onClick={() => { setFilterYear("all"); setFilterMonth("all"); }}>
              Zurücksetzen
            </Button>
          </div>
        )}
      </div>

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

      {selected.size > 0 && (
        <Card className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary/5 p-3">
          <div className="text-sm font-medium">{selected.size} ausgewählt</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />Bearbeiten
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />Löschen
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="mr-2 h-4 w-4" />Abbrechen
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="Alle auswählen"
                />
              </TableHead>
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
              const dest = t.transfer_to_account_id ? accountById[t.transfer_to_account_id] : null;
              const isSel = selected.has(t.id);
              const isTransfer = t.kind === "transfer";
              return (
                <TableRow key={t.id} data-state={isSel ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={(v) => toggleOne(t.id, !!v)}
                      aria-label="Auswählen"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(t.occurred_on)}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{t.note ?? (isTransfer ? "Umbuchung" : (cat?.name ?? "—"))}</span>
                      {isTransfer && <Badge variant="outline" className="text-[10px]">↔ Umbuchung</Badge>}
                      {t.is_anyfin && <Badge variant="outline" className="text-[10px]">Anyfin</Badge>}
                      {t.interest_amount != null && t.interest_amount > 0 && (
                        <Badge variant="outline" className="text-[10px]">Zins {fmtEUR(Number(t.interest_amount))}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isTransfer ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : cat ? (
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
                      {isTransfer ? (
                        <span className="font-medium">
                          {acc?.name ?? "?"} <span className="text-muted-foreground">→</span> {dest?.name ?? "?"}
                        </span>
                      ) : (
                        <>
                          {acc && (
                            <span>
                              <span className="text-muted-foreground">Konto: </span>
                              <span className="font-medium">{acc.name}</span>
                            </span>
                          )}
                          {loan && (
                            <Badge variant="outline" className="w-fit">
                              {loan.type === "credit_card" ? "💳 Karte" : loan.type === "darlehen" ? "🤝 Darlehen" : "🏦 Kredit"}: {loan.name}
                            </Badge>
                          )}
                          {!acc && !loan && "—"}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${isTransfer ? "text-muted-foreground" : t.kind === "expense" ? "text-red-500" : "text-emerald-500"}`}>
                    {isTransfer ? fmtEUR(Number(t.amount)) : `${t.kind === "expense" ? "−" : "+"}${fmtEUR(Number(t.amount))}`}
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
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Noch keine {title.toLowerCase()}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected.size} Einträge wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={onBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        ids={selectedIds}
        onDone={() => { clearSelection(); refresh(); }}
      />
    </div>
  );
}

function BulkEditDialog({ open, onOpenChange, ids, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; ids: string[]; onDone: () => void }) {
  const accounts = useAccounts();
  const categories = useCategories();
  const [accountId, setAccountId] = useState<string>("");
  const [loanAccountId, setLoanAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [interestStr, setInterestStr] = useState<string>("");
  const [setAnyfin, setSetAnyfin] = useState(false);
  const [anyfinValue, setAnyfinValue] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountId(""); setLoanAccountId(""); setCategoryId("");
      setInterestStr(""); setSetAnyfin(false); setAnyfinValue(false);
    }
  }, [open]);

  const bankAccounts = (accounts.data ?? []).filter((a) => a.type === "checking" || a.type === "savings" || a.type === "clearing");
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "credit_card" || a.type === "darlehen");

  const submit = async () => {
    if (ids.length === 0) return;
    const patch: Record<string, any> = {};
    if (accountId) patch.account_id = accountId;
    if (loanAccountId === "__none__") patch.loan_account_id = null;
    else if (loanAccountId) patch.loan_account_id = loanAccountId;
    if (categoryId === "__none__") patch.category_id = null;
    else if (categoryId) patch.category_id = categoryId;
    if (interestStr.trim() !== "") {
      const n = Number(interestStr);
      if (!Number.isFinite(n)) { toast.error("Ungültige Zinsen"); return; }
      patch.interest_amount = n;
    }
    if (setAnyfin) patch.is_anyfin = anyfinValue;

    if (Object.keys(patch).length === 0) {
      toast.error("Keine Änderungen ausgewählt");
      return;
    }
    setBusy(true);
    const { error } = await (supabase.from("transactions") as any).update(patch).in("id", ids);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} aktualisiert`);
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ids.length} Transaktionen bearbeiten</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Nur Felder, die du hier setzt, werden überschrieben. Leere Felder bleiben unverändert.
        </p>
        <div className="space-y-3">
          <div>
            <Label>Konto</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Unverändert lassen" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}{a.type === "clearing" ? " (Verrechnung)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Verknüpftes Konto (Kredit/Karte/Darlehen)</Label>
            <Select value={loanAccountId} onValueChange={setLoanAccountId}>
              <SelectTrigger><SelectValue placeholder="Unverändert lassen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Entfernen —</SelectItem>
                {loanAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Unverändert lassen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Entfernen —</SelectItem>
                {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name} ({c.kind === "income" ? "Einn." : "Ausg."})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Zinsen (€)</Label>
            <Input
              type="number" step="0.01" min="0"
              placeholder="Unverändert lassen"
              value={interestStr}
              onChange={(e) => setInterestStr(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Anyfin-Flag setzen</Label>
              <p className="text-xs text-muted-foreground">Aktivieren, um den Anyfin-Status zu überschreiben.</p>
            </div>
            <Switch checked={setAnyfin} onCheckedChange={setSetAnyfin} />
          </div>
          {setAnyfin && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Wert</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{anyfinValue ? "Anyfin: Ja" : "Anyfin: Nein"}</span>
                <Switch checked={anyfinValue} onCheckedChange={setAnyfinValue} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionDialog({ tx, defaultKind, onClose }: { tx: Transaction | null; defaultKind?: Transaction["kind"]; onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories();
  const [kind, setKind] = useState<Transaction["kind"]>(tx?.kind ?? defaultKind ?? "expense");
  const [accountId, setAccountId] = useState<string>(tx?.account_id ?? "");
  const [transferToId, setTransferToId] = useState<string>(tx?.transfer_to_account_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(tx?.category_id ?? "");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [date, setDate] = useState(tx?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(tx?.note ?? "");
  const [loanAccountId, setLoanAccountId] = useState<string>(tx?.loan_account_id ?? "none");
  const [busy, setBusy] = useState(false);

  const isTransfer = kind === "transfer";
  const filteredCats = (categories.data ?? []).filter((c) => c.kind === kind);
  const bankAccounts = (accounts.data ?? []).filter((a) => a.type === "checking" || a.type === "savings" || a.type === "clearing");
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "credit_card" || a.type === "darlehen");
  // For transfers, allow ANY account (bank, clearing, loan, card) on both sides
  const allTransferAccounts = (accounts.data ?? []).filter((a) => !a.archived);
  const loanIcon = (t: string) => t === "credit_card" ? "💳" : t === "darlehen" ? "🤝" : "🏦";
  const loanLabel = (t: string) => t === "credit_card" ? "Karte" : t === "darlehen" ? "Darlehen" : "Kredit";

  const selectedAccount = (accounts.data ?? []).find((a) => a.id === accountId);
  const effectiveAccountIcon = (a: { type: string }) =>
    a.type === "clearing" ? "⚖️" : a.type === "savings" ? "💰" : a.type === "credit_card" ? "💳" : a.type === "loan" ? "🏦" : a.type === "darlehen" ? "🤝" : "🏦";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !accountId) { toast.error("Bitte Konto wählen"); return; }
    if (isTransfer) {
      if (!transferToId) { toast.error("Bitte Zielkonto wählen"); return; }
      if (transferToId === accountId) { toast.error("Quell- und Zielkonto müssen unterschiedlich sein"); return; }
    }
    setBusy(true);
    let finalLoan = loanAccountId && loanAccountId !== "none" ? loanAccountId : null;
    if (!isTransfer && !finalLoan && selectedAccount?.type === "clearing" && selectedAccount.linked_loan_account_id) {
      finalLoan = selectedAccount.linked_loan_account_id;
    }
    const payload: any = {
      user_id: user.id,
      account_id: accountId,
      category_id: isTransfer ? null : (categoryId || null),
      loan_account_id: isTransfer ? null : finalLoan,
      transfer_to_account_id: isTransfer ? transferToId : null,
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
              <SelectItem value="transfer">↔ Umbuchung (neutral)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{isTransfer ? "Von Konto (Quelle)" : "Konto (Pflicht)"}</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
            <SelectContent>
              {(isTransfer ? allTransferAccounts : bankAccounts).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {effectiveAccountIcon(a)} {a.name}{a.type === "clearing" ? " (Verrechnung)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isTransfer && (
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedAccount?.type === "clearing"
                ? "Verrechnungskonto: zählt nicht zur Liquidität, beeinflusst aber den verknüpften Kredit."
                : "Geld fließt von / zu diesem Bankkonto."}
            </p>
          )}
        </div>
        {isTransfer && (
          <div>
            <Label>Auf Konto (Ziel)</Label>
            <Select value={transferToId} onValueChange={setTransferToId}>
              <SelectTrigger><SelectValue placeholder="Zielkonto wählen" /></SelectTrigger>
              <SelectContent>
                {allTransferAccounts.filter((a) => a.id !== accountId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {effectiveAccountIcon(a)} {a.name}{a.type === "clearing" ? " (Verrechnung)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Umbuchungen zählen nicht als Einnahme oder Ausgabe — z.B. Tilgung einer Karte mit einem neuen Kredit.
            </p>
          </div>
        )}
        {!isTransfer && (
          <div>
            <Label>Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
              <SelectContent>
                {filteredCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
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
        {!isTransfer && (
          <div>
            <Label>Verknüpfter Kredit / Kreditkarte / Darlehen (optional)</Label>
            <Select value={loanAccountId} onValueChange={setLoanAccountId}>
              <SelectTrigger><SelectValue placeholder="Keiner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keiner</SelectItem>
                {loanAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {loanIcon(a.type)} {loanLabel(a.type)}: {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {kind === "income"
                ? "Z.B. wenn diese Einnahme eine Kredit- oder Darlehensauszahlung ist."
                : "Z.B. wenn diese Ausgabe eine Rate / Tilgung für einen Kredit, ein Darlehen oder eine Kreditkarten-Zahlung ist."}
            </p>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
