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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccounts, useCategories } from "@/lib/queries";
import { fmtEUR, fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2, RefreshCw, Repeat } from "lucide-react";
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
  note: string | null;
  frequency: Frequency;
  start_on: string;
  next_due_on: string;
  last_booked_on: string | null;
  active: boolean;
};

const freqLabel: Record<Frequency, string> = {
  monthly: "Monatlich",
  quarterly: "Quartalsweise",
  yearly: "Jährlich",
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
  const [processing, setProcessing] = useState(false);

  const accountById = useMemo(() => Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const catById = useMemo(() => Object.fromEntries((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["recurring_rules"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["account_balances"] });
    qc.invalidateQueries({ queryKey: ["monthly_summary"] });
  };

  const runDue = async () => {
    setProcessing(true);
    const { data, error } = await (supabase as any).rpc("process_due_recurring");
    setProcessing(false);
    if (error) toast.error(error.message);
    else {
      const n = Number(data ?? 0);
      toast.success(n > 0 ? `${n} Buchung(en) erstellt` : "Keine fälligen Buchungen");
      refresh();
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Regel löschen? Bestehende Buchungen bleiben erhalten.")) return;
    const { error } = await (supabase as any).from("recurring_rules").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); refresh(); }
  };

  const onToggleActive = async (id: string, active: boolean) => {
    const { error } = await (supabase as any).from("recurring_rules").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const items = rules.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Automatisch</div>
          <h1 className="text-3xl font-bold">Wiederkehrende Buchungen</h1>
          <p className="text-sm text-muted-foreground">Abos, Mieten, Gehälter, Kreditraten — automatisch verbucht</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDue} disabled={processing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${processing ? "animate-spin" : ""}`} />Jetzt fällige verbuchen
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Neu</Button>
            </DialogTrigger>
            <RuleDialog key={editing?.id ?? "new"} rule={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
          </Dialog>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Noch keine wiederkehrenden Buchungen. Lege z.B. Miete, Netflix, Gehalt oder eine Kreditrate an.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => {
            const cat = r.category_id ? catById[r.category_id] : null;
            const acc = accountById[r.account_id];
            const loan = r.loan_account_id ? accountById[r.loan_account_id] : null;
            const tone = r.kind === "income" ? "text-emerald-500" : "text-red-500";
            return (
              <Card key={r.id} className={`p-4 transition hover:border-primary/50 ${!r.active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg"
                      style={{ backgroundColor: `${cat?.color ?? "#94a3b8"}20` }}
                    >
                      {cat?.icon ?? <Repeat className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{freqLabel[r.frequency]}</div>
                      <div className="truncate font-medium">{r.note || cat?.name || "Ohne Kategorie"}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className={`mt-3 text-xl font-semibold ${tone}`}>
                  {r.kind === "income" ? "+" : "−"}{fmtEUR(r.amount)}
                </div>

                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {cat && <div>Kategorie: <span className="text-foreground">{cat.name}</span></div>}
                  {acc && <div>Konto: <span className="text-foreground">{acc.name}</span></div>}
                  <div>Nächste Fälligkeit: <span className="text-foreground">{fmtDate(r.next_due_on)}</span></div>
                </div>

                {loan && (
                  <Badge variant="outline" className="mt-2">
                    {loan.type === "credit_card" ? "💳 Karte" : "🏦 Kredit"}: {loan.name}
                  </Badge>
                )}

                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">{r.active ? "Aktiv" : "Pausiert"}</span>
                  <Switch checked={r.active} onCheckedChange={() => onToggleActive(r.id, r.active)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RuleDialog({ rule, onClose }: { rule: Partial<RecurringRule> | null; onClose: () => void }) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const categories = useCategories();
  const [kind, setKind] = useState<Kind>((rule?.kind as Kind) ?? "expense");
  const [accountId, setAccountId] = useState(rule?.account_id ?? "");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [amount, setAmount] = useState(String(rule?.amount ?? ""));
  const [note, setNote] = useState(rule?.note ?? "");
  const [frequency, setFrequency] = useState<Frequency>((rule?.frequency as Frequency) ?? "monthly");
  const [startOn, setStartOn] = useState(rule?.start_on ?? new Date().toISOString().slice(0, 10));
  const [nextDue, setNextDue] = useState(rule?.next_due_on ?? new Date().toISOString().slice(0, 10));
  const [loanAccountId, setLoanAccountId] = useState<string>(rule?.loan_account_id ?? "none");
  const [busy, setBusy] = useState(false);

  const filteredCats = (categories.data ?? []).filter((c) => c.kind === kind);
  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "credit_card");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !accountId) { toast.error("Bitte Konto wählen"); return; }
    setBusy(true);
    const payload: any = {
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId || null,
      loan_account_id: loanAccountId && loanAccountId !== "none" ? loanAccountId : null,
      kind,
      amount: Number(amount) || 0,
      note: note || null,
      frequency,
      start_on: startOn,
      next_due_on: nextDue,
    };
    const { error } = rule?.id
      ? await (supabase as any).from("recurring_rules").update(payload).eq("id", rule.id)
      : await (supabase as any).from("recurring_rules").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onClose(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{rule?.id ? "Regel bearbeiten" : "Neue wiederkehrende Buchung"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
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
            <Label>Intervall</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monatlich</SelectItem>
                <SelectItem value="quarterly">Quartalsweise</SelectItem>
                <SelectItem value="yearly">Jährlich</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <Label>Beschreibung</Label>
            <Input value={note ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="z.B. Netflix" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start</Label>
            <Input type="date" required value={startOn} onChange={(e) => { setStartOn(e.target.value); if (!rule?.id) setNextDue(e.target.value); }} />
          </div>
          <div>
            <Label>Nächste Fälligkeit</Label>
            <Input type="date" required value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </div>
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
              ? "Z.B. wenn diese Einnahme eine wiederkehrende Kreditauszahlung ist."
              : "Z.B. wenn diese Ausgabe eine monatliche Kreditrate oder Kreditkarten-Zahlung ist."}
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
