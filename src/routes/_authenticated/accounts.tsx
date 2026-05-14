import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { useAccountBalances, type Account, type AccountBalance } from "@/lib/queries";
import { fmtEUR, accountTypeLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Archive, Trash2, Wallet, CreditCard, Landmark, HandCoins } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const balances = useAccountBalances();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["account_balances"] });
  };

  const onArchive = async (id: string, archived: boolean) => {
    const { error } = await supabase.from("accounts").update({ archived: !archived }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(archived ? "Konto reaktiviert" : "Konto archiviert"); refresh(); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Konto und alle zugehörigen Transaktionen löschen?")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); refresh(); }
  };

  const all = balances.data ?? [];
  const bank = all.filter((a) => a.type === "checking" || a.type === "savings");
  const cards = all.filter((a) => a.type === "credit_card");
  const loans = all.filter((a) => a.type === "loan");
  const darlehen = all.filter((a) => a.type === "darlehen");

  const newOf = (t: Account["type"]) => {
    setEditing({ type: t });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Konten verwalten</h1>
        <p className="text-sm text-muted-foreground">
          Bankkonten, Kreditkarten und Kredite – alle Salden werden live aus Transaktionen berechnet.
        </p>
      </div>

      <section className="space-y-4">
        <SectionHeader
          title="Bankkonten"
          desc="Giro- und Sparkonten. Saldo = Startsaldo + Einnahmen − Ausgaben."
          icon={<Wallet className="h-5 w-5 text-primary" />}
          onNew={() => newOf("checking")}
        />
        <AccountGrid items={bank} onEdit={(a) => { setEditing(a); setOpen(true); }} onArchive={onArchive} onDelete={onDelete} emptyHint="Noch keine Bankkonten." />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Kreditkarten"
          desc="Ausgaben belasten die Karte (negativer Saldo). Tilgung als Umbuchung vom Girokonto."
          icon={<CreditCard className="h-5 w-5 text-primary" />}
          onNew={() => newOf("credit_card")}
        />
        <AccountGrid items={cards} onEdit={(a) => { setEditing(a); setOpen(true); }} onArchive={onArchive} onDelete={onDelete} emptyHint="Noch keine Kreditkarten." />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Kredite"
          desc="Restschuld = Ursprungsbetrag − Summe der Tilgungen (vom Kreditkonto verbuchte Ausgaben)."
          icon={<Landmark className="h-5 w-5 text-primary" />}
          onNew={() => newOf("loan")}
        />
        <AccountGrid items={loans} onEdit={(a) => { setEditing(a); setOpen(true); }} onArchive={onArchive} onDelete={onDelete} emptyHint="Noch keine Kredite." />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Darlehen"
          desc="Zinsfreie private Darlehen. Optionales Rückzahlungsdatum."
          icon={<HandCoins className="h-5 w-5 text-primary" />}
          onNew={() => newOf("darlehen")}
        />
        <AccountGrid items={darlehen} onEdit={(a) => { setEditing(a); setOpen(true); }} onArchive={onArchive} onDelete={onDelete} emptyHint="Noch keine Darlehen." />
      </section>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); refresh(); } }}>
        <AccountDialog key={editing?.id ?? `new-${editing?.type ?? "checking"}`} account={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
      </Dialog>
    </div>
  );
}

function SectionHeader({ title, desc, icon, onNew }: { title: string; desc: string; icon?: React.ReactNode; onNew: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      <Button onClick={onNew}><Plus className="mr-2 h-4 w-4" />Neu</Button>
    </div>
  );
}

function AccountGrid({
  items,
  onEdit,
  onArchive,
  onDelete,
  emptyHint,
}: {
  items: AccountBalance[];
  onEdit: (a: AccountBalance) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  emptyHint: string;
}) {
  if (items.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">{emptyHint}</Card>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <Card key={a.id} className={`p-4 transition hover:border-primary/50 ${a.archived ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <Link to="/accounts/$accountId" params={{ accountId: a.id }} className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl">
                {a.icon || "🏦"}
              </span>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{accountTypeLabel[a.type]}</div>
                <div className="truncate font-medium hover:underline">{a.name}</div>
              </div>
            </Link>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => onEdit(a)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onArchive(a.id, a.archived)}>
                <Archive className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onDelete(a.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Link to="/accounts/$accountId" params={{ accountId: a.id }} className={`mt-3 block text-xl font-semibold ${a.balance < 0 ? "text-red-600" : ""}`}>{fmtEUR(a.balance)}</Link>
          <div className="mt-1 text-xs text-muted-foreground">Startsaldo: {fmtEUR(a.starting_balance)}</div>
          {a.type === "credit_card" && a.credit_limit != null && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Limit: {fmtEUR(a.credit_limit)}</span>
                <span>{Math.round(Math.min(100, Math.max(0, (-Math.min(a.balance, 0) / a.credit_limit) * 100)))}% genutzt</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, (-Math.min(a.balance, 0) / a.credit_limit) * 100))}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">
                Verfügbar: {fmtEUR(Math.max(0, a.credit_limit + Math.min(a.balance, 0)))}
              </div>
            </div>
          )}
          {a.type === "loan" && a.loan_principal != null && (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <div>Ursprungsbetrag: {fmtEUR(a.loan_principal)}</div>
              {a.loan_interest_rate != null && <div>Zinssatz: {a.loan_interest_rate}% p.a.</div>}
              {a.loan_term_months != null && <div>Laufzeit: {a.loan_term_months} Monate</div>}
              <div className="pt-1 font-medium text-foreground">
                Restschuld: {fmtEUR(Math.max(0, a.loan_principal + Math.min(a.balance, 0)))}
              </div>
            </div>
          )}
          {a.type === "darlehen" && (
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <div>Zinsfrei</div>
              {a.loan_principal != null && <div>Ursprungsbetrag: {fmtEUR(a.loan_principal)}</div>}
              {a.loan_due_on && <div>Rückzahlung: {new Date(a.loan_due_on).toLocaleDateString("de-DE")}</div>}
              {a.loan_principal != null && (
                <div className="pt-1 font-medium text-foreground">
                  Offen: {fmtEUR(Math.max(0, a.loan_principal + Math.min(a.balance, 0)))}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function AccountDialog({ account, onClose }: { account: Partial<Account> | null; onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>((account?.type as Account["type"]) ?? "checking");
  const [start, setStart] = useState(String(account?.starting_balance ?? 0));
  const [creditLimit, setCreditLimit] = useState(String(account?.credit_limit ?? ""));
  const [loanPrincipal, setLoanPrincipal] = useState(String(account?.loan_principal ?? ""));
  const [loanRate, setLoanRate] = useState(String(account?.loan_interest_rate ?? ""));
  const [loanTerm, setLoanTerm] = useState(String(account?.loan_term_months ?? ""));
  const [loanDueOn, setLoanDueOn] = useState(account?.loan_due_on ?? "");
  const defaultIcon = (t: Account["type"]) =>
    t === "credit_card" ? "💳" : t === "loan" ? "🏛️" : t === "darlehen" ? "🤝" : t === "savings" ? "💰" : "🏦";
  const [icon, setIcon] = useState(account?.icon ?? defaultIcon((account?.type as Account["type"]) ?? "checking"));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload: any = {
      name,
      type,
      icon: icon || defaultIcon(type),
      starting_balance: Number(start) || 0,
      user_id: user.id,
      credit_limit: type === "credit_card" && creditLimit !== "" ? Number(creditLimit) : null,
      loan_principal: (type === "loan" || type === "darlehen") && loanPrincipal !== "" ? Number(loanPrincipal) : null,
      loan_interest_rate: type === "loan" && loanRate !== "" ? Number(loanRate) : null,
      loan_term_months: type === "loan" && loanTerm !== "" ? Number(loanTerm) : null,
      loan_due_on: type === "darlehen" && loanDueOn !== "" ? loanDueOn : null,
    };
    const { error } = account?.id
      ? await supabase.from("accounts").update(payload).eq("id", account.id)
      : await supabase.from("accounts").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onClose(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{account?.id ? "Konto bearbeiten" : "Neues Konto"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <div>
            <Label>Emoji</Label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="text-center text-xl" />
          </div>
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Typ</Label>
          <Select value={type} onValueChange={(v) => setType(v as Account["type"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="checking">Girokonto</SelectItem>
              <SelectItem value="savings">Sparkonto</SelectItem>
              <SelectItem value="credit_card">Kreditkarte</SelectItem>
              <SelectItem value="loan">Kredit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Startsaldo (€)</Label>
          <Input type="number" step="0.01" value={start} onChange={(e) => setStart(e.target.value)} />
          {type === "credit_card" && (
            <p className="mt-1 text-xs text-muted-foreground">Tipp: aktueller Kartensaldo, meist negativ (Schulden).</p>
          )}
          {type === "loan" && (
            <p className="mt-1 text-xs text-muted-foreground">Tipp: aktuelle Restschuld als negativen Wert eintragen.</p>
          )}
        </div>
        {type === "credit_card" && (
          <div>
            <Label>Kreditlimit (€)</Label>
            <Input type="number" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
          </div>
        )}
        {type === "loan" && (
          <>
            <div>
              <Label>Ursprünglicher Kreditbetrag (€)</Label>
              <Input type="number" step="0.01" value={loanPrincipal} onChange={(e) => setLoanPrincipal(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Zinssatz (% p.a.)</Label>
                <Input type="number" step="0.01" value={loanRate} onChange={(e) => setLoanRate(e.target.value)} />
              </div>
              <div>
                <Label>Laufzeit (Monate)</Label>
                <Input type="number" step="1" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} />
              </div>
            </div>
          </>
        )}
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
