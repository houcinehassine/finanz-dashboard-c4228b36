import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccountBalances, type Account } from "@/lib/queries";
import { fmtEUR, accountTypeLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Archive, Trash2 } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konten</h1>
          <p className="text-sm text-muted-foreground">Bankkonten, Sparkonten, Kreditkarten und Kredite</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Neu</Button>
          </DialogTrigger>
          <AccountDialog key={editing?.id ?? "new"} account={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(balances.data ?? []).map((a) => (
          <Card key={a.id} className={`p-4 ${a.archived ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{accountTypeLabel[a.type]}</div>
                <div className="font-medium">{a.name}</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
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
            <div className={`mt-3 text-xl font-semibold ${a.balance < 0 ? "text-red-600" : ""}`}>{fmtEUR(a.balance)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Startsaldo: {fmtEUR(a.starting_balance)}</div>
            {a.type === "credit_card" && a.credit_limit != null && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Limit: {fmtEUR(a.credit_limit)}</span>
                  <span>{Math.round(Math.min(100, Math.max(0, (-Math.min(a.balance, 0) / a.credit_limit) * 100)))}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, (-Math.min(a.balance, 0) / a.credit_limit) * 100))}%` }} />
                </div>
              </div>
            )}
            {a.type === "loan" && a.loan_principal != null && (
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <div>Ursprung: {fmtEUR(a.loan_principal)}</div>
                {a.loan_interest_rate != null && <div>Zins: {a.loan_interest_rate}% p.a.</div>}
                {a.loan_term_months != null && <div>Laufzeit: {a.loan_term_months} Monate</div>}
                <div className="font-medium text-foreground">Restschuld: {fmtEUR(Math.max(0, a.loan_principal + a.balance))}</div>
              </div>
            )}
          </Card>
        ))}
        {balances.data?.length === 0 && (
          <Card className="col-span-full p-6 text-center text-sm text-muted-foreground">
            Noch keine Konten – Klicke auf „Neu".
          </Card>
        )}
      </div>
    </div>
  );
}

function AccountDialog({ account, onClose }: { account: Partial<Account> | null; onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<Account["type"]>((account?.type as Account["type"]) ?? "checking");
  const [start, setStart] = useState(String(account?.starting_balance ?? 0));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = { name, type, starting_balance: Number(start) || 0, user_id: user.id };
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
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
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
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
