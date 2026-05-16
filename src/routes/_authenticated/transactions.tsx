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
import { Plus, Trash2, Pencil, X, Copy, CalendarRange } from "lucide-react";
import { toast } from "sonner";

type RelRange = { amount: number; unit: "month" | "year" };
const PRESETS: { label: string; value: RelRange }[] = [
  { label: "1 Monat",  value: { amount: 1, unit: "month" } },
  { label: "3 Monate", value: { amount: 3, unit: "month" } },
  { label: "6 Monate", value: { amount: 6, unit: "month" } },
  { label: "1 Jahr",   value: { amount: 1, unit: "year" } },
];
function relToFromTo(r: RelRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (r.unit === "month") from.setMonth(from.getMonth() - r.amount);
  else from.setFullYear(from.getFullYear() - r.amount);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

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
  const [range, setRange] = useState<RelRange>({ amount: 3, unit: "month" });
  const now = new Date();
  const [fromYear, setFromYear] = useState<string>("all");
  const [fromMonth, setFromMonth] = useState<string>("all");
  const [toYear, setToYear] = useState<string>("all");
  const [toMonth, setToMonth] = useState<string>("all");

  // All transactions (for deriving available filter options)
  const allTxs = useTransactions();

  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const ymActive = fromYear !== "all" || fromMonth !== "all" || toYear !== "all" || toMonth !== "all";

  const { from, to } = useMemo(() => {
    if (!ymActive) return relToFromTo(range);
    const fy = fromYear !== "all" ? Number(fromYear) : null;
    const fm = fromMonth !== "all" ? Number(fromMonth) : null;
    const ty = toYear !== "all" ? Number(toYear) : null;
    const tm = toMonth !== "all" ? Number(toMonth) : null;
    // Determine fallback bounds from data
    const dates = (allTxs.data ?? []).map((t) => t.occurred_on).sort();
    const oldest = dates[0] ?? `${now.getFullYear()}-01-01`;
    const newest = dates[dates.length - 1] ?? now.toISOString().slice(0, 10);
    const fyy = fy ?? Number(oldest.slice(0, 4));
    const fmm = fm ?? 1;
    const tyy = ty ?? Number(newest.slice(0, 4));
    const tmm = tm ?? 12;
    const lastDay = new Date(tyy, tmm, 0).getDate();
    return { from: `${fyy}-${pad(fmm)}-01`, to: `${tyy}-${pad(tmm)}-${pad(lastDay)}` };
  }, [range, fromYear, fromMonth, toYear, toMonth, ymActive, allTxs.data]);

  const txs = useTransactions({
    accountId: filterAccount === "all" ? undefined : filterAccount,
    categoryId: filterCategory === "all" ? undefined : filterCategory,
    from,
    to,
  });

  // Years available: from oldest tx year to current
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const t of allTxs.data ?? []) ys.add(Number(t.occurred_on.slice(0, 4)));
    if (ys.size === 0) return [now.getFullYear()];
    const min = Math.min(...ys);
    const max = Math.max(now.getFullYear(), Math.max(...ys));
    return Array.from({ length: max - min + 1 }, (_, i) => max - i);
  }, [allTxs.data]);

  const monthsForYear = (yearStr: string) => {
    const ms = new Set<number>();
    for (const t of allTxs.data ?? []) {
      if (yearStr !== "all" && t.occurred_on.slice(0, 4) !== yearStr) continue;
      ms.add(Number(t.occurred_on.slice(5, 7)));
    }
    return Array.from(ms).sort((a, b) => a - b);
  };
  const fromAvailableMonths = useMemo(() => monthsForYear(fromYear), [allTxs.data, fromYear]);
  const toAvailableMonths = useMemo(() => monthsForYear(toYear), [allTxs.data, toYear]);
  const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

  // Account IDs actually used in transactions (any account_id, loan_account_id, or transfer_to)
  const usedAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of allTxs.data ?? []) {
      if (t.account_id) ids.add(t.account_id);
      if (t.loan_account_id) ids.add(t.loan_account_id);
      if (t.transfer_to_account_id) ids.add(t.transfer_to_account_id);
    }
    return ids;
  }, [allTxs.data]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountById = useMemo(() => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const catById = useMemo(() => Object.fromEntries((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  // Categories available: only those used in transactions matching current view + account + date filters
  const availableCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of txs.data ?? []) {
      if (view !== "all" && t.kind !== view) continue;
      if (t.category_id) ids.add(t.category_id);
    }
    return ids;
  }, [txs.data, view]);

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

  const { user } = useAuth();
  const onDelete = async (id: string) => {
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
              {(accounts.data ?? [])
                .filter((a) => !a.archived && (usedAccountIds.has(a.id) || a.id === filterAccount))
                .map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-auto min-w-[7rem] gap-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {(categories.data ?? [])
                .filter((c) => view === "all" || c.kind === view)
                .filter((c) => availableCategoryIds.has(c.id) || c.id === filterCategory)
                .map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
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

      <Card className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: Von Monat/Jahr - Bis Monat/Jahr */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <CalendarRange className="h-4 w-4" /> Von / Bis
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Von</span>
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Monat</SelectItem>
                  {fromAvailableMonths.map((m) => (
                    <SelectItem key={m} value={String(m)}>{MONTHS_DE[m - 1]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fromYear} onValueChange={setFromYear}>
                <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Jahr</SelectItem>
                  {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">Bis</span>
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Monat</SelectItem>
                  {toAvailableMonths.map((m) => (
                    <SelectItem key={m} value={String(m)}>{MONTHS_DE[m - 1]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={toYear} onValueChange={setToYear}>
                <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Jahr</SelectItem>
                  {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              {ymActive && (
                <Button variant="ghost" size="sm" onClick={() => { setFromYear("all"); setFromMonth("all"); setToYear("all"); setToMonth("all"); }}>
                  Zurücksetzen
                </Button>
              )}
            </div>
          </div>

          {/* Right: Eigene Dauer */}
          <div className={`flex flex-col gap-2 ${ymActive ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Eigene Dauer</div>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => {
                const active = range.amount === p.value.amount && range.unit === p.value.unit;
                return (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => setRange(p.value)}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

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
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }} title="Bearbeiten"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDuplicate(t)} title="Duplizieren"><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(t.id)} title="Löschen"><Trash2 className="h-4 w-4" /></Button>
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

  const bankAccounts = (accounts.data ?? []).filter((a) => a.type === "checking" || a.type === "savings" || a.type === "clearing" || a.type === "credit_card");
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "darlehen");

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

export function TransactionDialog({ tx, defaultKind, defaultAccountId, defaultLoanAccountId, onClose }: { tx: Transaction | null; defaultKind?: Transaction["kind"]; defaultAccountId?: string; defaultLoanAccountId?: string; onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories();
  const [kind, setKind] = useState<Transaction["kind"]>(tx?.kind ?? defaultKind ?? "expense");
  const [accountId, setAccountId] = useState<string>(tx?.account_id ?? defaultAccountId ?? "");
  const [transferToId, setTransferToId] = useState<string>(tx?.transfer_to_account_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(tx?.category_id ?? "");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [date, setDate] = useState(tx?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(tx?.note ?? "");
  const [loanAccountId, setLoanAccountId] = useState<string>(tx?.loan_account_id ?? defaultLoanAccountId ?? "none");
  const [busy, setBusy] = useState(false);

  const isTransfer = kind === "transfer";
  const filteredCats = (categories.data ?? []).filter((c) => c.kind === kind);
  const bankAccounts = (accounts.data ?? []).filter((a) => a.type === "checking" || a.type === "savings" || a.type === "clearing" || a.type === "credit_card");
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "darlehen");
  // For transfers, allow ANY account (bank, clearing, loan, card) on both sides
  const allTransferAccounts = (accounts.data ?? []).filter((a) => !a.archived);
  const loanIcon = (t: string) => t === "darlehen" ? "🤝" : "🏦";
  const loanLabel = (t: string) => t === "darlehen" ? "Darlehen" : "Kredit";

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
