import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAccounts, useCategories } from "@/lib/queries";
import { fmtEUR, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2, Repeat, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recurring")({
  component: RecurringPage,
});

type Frequency = "monthly" | "quarterly" | "yearly";
type Kind = "income" | "expense";

type RecurringRule = {
  id: string;
  account_id: string;
  category_id: string | null;
  loan_account_id: string | null;
  kind: Kind;
  amount: number;
  name: string | null;
  note: string | null;
  frequency: Frequency;
  start_on: string;
  end_on: string | null;
  next_due_on: string;
  last_booked_on: string | null;
  day_of_month: number | null;
  active: boolean;
};

const freqLabel: Record<Frequency, string> = {
  monthly: "monatlich",
  quarterly: "quartalsweise",
  yearly: "jährlich",
};

function useRecurringRules() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["recurring_rules"],
    queryFn: async (): Promise<RecurringRule[]> => {
      const { data, error } = await (supabase as any)
        .from("recurring_rules")
        .select("*")
        .order("next_due_on", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) }));
    },
  });
}

function RecurringPage() {
  const rules = useRecurringRules();
  const accounts = useAccounts();
  const categories = useCategories();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<RecurringRule> | null>(null);
  const [open, setOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const accountById = useMemo(() => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const catById = useMemo(() => Object.fromEntries((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["recurring_rules"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["account_balances"] });
    qc.invalidateQueries({ queryKey: ["monthly_summary"] });
  };

  const items = rules.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const dueItems = items.filter((r) => r.active && r.next_due_on <= today && (!r.end_on || r.next_due_on <= r.end_on));

  const onDelete = async (id: string) => {
    if (!confirm("Regel löschen? Bestehende Buchungen bleiben erhalten.")) return;
    const { error } = await (supabase as any).from("recurring_rules").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); refresh(); }
  };

  const onBookNow = async (id: string) => {
    setBookingId(id);
    const { error } = await (supabase as any).rpc("book_recurring_now", { rule_id: id });
    setBookingId(null);
    if (error) toast.error(error.message);
    else { toast.success("Buchung erstellt"); refresh(); }
  };

  const linkedLabel = (r: RecurringRule) => {
    if (r.loan_account_id) {
      const a = accountById[r.loan_account_id];
      if (a) {
        const prefix = a.type === "credit_card" ? "Kreditkarte" : a.type === "darlehen" ? "Darlehen" : "Kredit";
        return `${prefix}: ${a.name}`;
      }
    }
    const a = accountById[r.account_id];
    return a ? `Bankkonto: ${a.name}` : "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Wiederkehrend</div>
          <h1 className="text-3xl font-bold">Wiederkehrende Buchungen</h1>
          <p className="text-sm text-muted-foreground">Abonnements, GEZ und alle wiederkehrenden Ausgaben</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={() => setEditing({})}>
              <Plus className="mr-2 h-4 w-4" />Neue wiederkehrende Buchung
            </Button>
          </DialogTrigger>
          <RuleDialog key={editing?.id ?? "new"} rule={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
        </Dialog>
      </div>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-amber-500">Fällige Buchungen</div>
        {dueItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Keine fälligen Buchungen</p>
        ) : (
          <div className="mt-3 space-y-2">
            {dueItems.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name || r.note || "Buchung"}</div>
                  <div className="text-xs text-muted-foreground">Fällig: {fmtDate(r.next_due_on)} · {fmtEUR(r.amount)}</div>
                </div>
                <Button size="sm" onClick={() => onBookNow(r.id)} disabled={bookingId === r.id}>
                  <Zap className="mr-1 h-4 w-4" />Jetzt buchen
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Noch keine wiederkehrenden Buchungen. Lege z.B. Miete, Netflix, Gehalt oder eine Kreditrate an.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead>Rhythmus</TableHead>
                <TableHead>Tag im Monat</TableHead>
                <TableHead>Verknüpft mit</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => {
                const cat = r.category_id ? catById[r.category_id] : null;
                const tone = r.kind === "income" ? "text-emerald-500" : "text-red-500";
                const dom = r.day_of_month ?? (Number((r.next_due_on || "").slice(8, 10)) || null);
                return (
                  <TableRow key={r.id} className={!r.active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-muted-foreground" />
                        {r.name || r.note || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cat ? <Badge variant="secondary">{cat.icon} {cat.name}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{freqLabel[r.frequency]}</TableCell>
                    <TableCell className="text-muted-foreground">{dom ? `${dom}.` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{linkedLabel(r)}</TableCell>
                    <TableCell className={`text-right font-semibold ${tone}`}>
                      {r.kind === "income" ? "+" : "−"}{fmtEUR(r.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Jetzt buchen" onClick={() => onBookNow(r.id)} disabled={bookingId === r.id}>
                          <Zap className="h-4 w-4 text-emerald-500" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Bearbeiten" onClick={() => { setEditing(r); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Löschen" onClick={() => onDelete(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function computeNextDue(startOn: string, dayOfMonth: number | null, frequency: Frequency): string {
  const start = new Date(startOn);
  if (!dayOfMonth) return startOn;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = start > today ? start : today;
  let candidate = new Date(base.getFullYear(), base.getMonth(), dayOfMonth);
  if (candidate < base) {
    if (frequency === "monthly") candidate.setMonth(candidate.getMonth() + 1);
    else if (frequency === "quarterly") candidate.setMonth(candidate.getMonth() + 3);
    else candidate.setFullYear(candidate.getFullYear() + 1);
  }
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}`;
}

function RuleDialog({ rule, onClose }: { rule: Partial<RecurringRule> | null; onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories();
  const [kind, setKind] = useState<Kind>((rule?.kind as Kind) ?? "expense");
  const [accountId, setAccountId] = useState(rule?.account_id ?? "");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [amount, setAmount] = useState(String(rule?.amount ?? ""));
  const [name, setName] = useState(rule?.name ?? rule?.note ?? "");
  const [frequency, setFrequency] = useState<Frequency>((rule?.frequency as Frequency) ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState<string>(String(rule?.day_of_month ?? 1));
  const [startOn, setStartOn] = useState(rule?.start_on ?? new Date().toISOString().slice(0, 10));
  const [endOn, setEndOn] = useState(rule?.end_on ?? "");
  const [loanAccountId, setLoanAccountId] = useState<string>(rule?.loan_account_id ?? "none");
  const [active, setActive] = useState<boolean>(rule?.active ?? true);
  const [busy, setBusy] = useState(false);

  const filteredCats = (categories.data ?? []).filter((c) => c.kind === kind);
  const bankAccounts = (accounts.data ?? []).filter((a) => a.type === "checking" || a.type === "savings");
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "credit_card" || a.type === "darlehen");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !accountId) { toast.error("Bitte Bankkonto wählen"); return; }
    if (!name.trim()) { toast.error("Bitte Name eingeben"); return; }
    setBusy(true);
    const dom = Number(dayOfMonth) || null;
    const nextDue = rule?.id ? rule.next_due_on! : computeNextDue(startOn, dom, frequency);
    const payload: any = {
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId || null,
      loan_account_id: loanAccountId && loanAccountId !== "none" ? loanAccountId : null,
      kind,
      amount: Number(amount) || 0,
      name: name.trim(),
      note: name.trim(),
      frequency,
      day_of_month: dom,
      start_on: startOn,
      end_on: endOn || null,
      next_due_on: nextDue,
      active,
    };
    const { error } = rule?.id
      ? await (supabase as any).from("recurring_rules").update(payload).eq("id", rule.id)
      : await (supabase as any).from("recurring_rules").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onClose(); }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{rule?.id ? "Regel bearbeiten" : "Neue wiederkehrende Buchung"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix, Rundfunkbeitrag…" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Betrag</Label>
            <Input type="number" step="0.01" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Typ</Label>
            <Select value={kind} onValueChange={(v) => { setKind(v as Kind); setCategoryId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Ausgabe</SelectItem>
                <SelectItem value="income">Einnahme</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rhythmus</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">monatlich</SelectItem>
                <SelectItem value="quarterly">quartalsweise</SelectItem>
                <SelectItem value="yearly">jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tag im Monat (1–28)</Label>
            <Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </div>
          <div>
            <Label>Bankkonto</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => <SelectItem key={a.id} value={a.id}>🏦 {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Startdatum</Label>
            <Input type="date" required value={startOn} onChange={(e) => setStartOn(e.target.value)} />
          </div>
          <div>
            <Label>Enddatum</Label>
            <Input type="date" value={endOn ?? ""} onChange={(e) => setEndOn(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Verknüpft mit (optional)</Label>
          <Select value={loanAccountId} onValueChange={setLoanAccountId}>
            <SelectTrigger><SelectValue placeholder="Keine Verknüpfung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Verknüpfung</SelectItem>
              {loanAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.type === "credit_card" ? "💳" : a.type === "darlehen" ? "🤝" : "🏦"} {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <Label className="cursor-pointer">Aktiv</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" disabled={busy}>Speichern</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
