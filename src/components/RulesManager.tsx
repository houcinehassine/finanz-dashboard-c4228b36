import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useAccounts, useCategories } from "@/lib/queries";
import { useImportRules, applyRules, type ImportRule, type ConditionField, type ConditionOp, type ActionKind } from "@/lib/rules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Pencil, Trash2, Plus, ArrowUp, ArrowDown, Play } from "lucide-react";
import { toast } from "sonner";

const FIELD_LABEL: Record<ConditionField, string> = {
  note: "Beschreibung",
  purpose: "Verwendungszweck",
  amount: "Betrag",
  kind: "Typ",
};
const OP_LABEL: Record<ConditionOp, string> = {
  contains: "enthält",
  equals: "ist gleich",
  eq: "= (Zahl)",
  gt: "> (größer als)",
  lt: "< (kleiner als)",
};

export function RulesManager() {
  const { user } = useAuth();
  const rules = useImportRules();
  const categories = useCategories();
  const accounts = useAccounts();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<ImportRule> | null>(null);
  const [deleting, setDeleting] = useState<ImportRule | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number; updated: number } | null>(null);

  const loanAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "darlehen"),
    [accounts.data],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["import_rules"] });

  const toggleActive = async (r: ImportRule) => {
    const { error } = await supabase.from("import_rules" as any).update({ active: !r.active }).eq("id", r.id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const move = async (r: ImportRule, dir: -1 | 1) => {
    const list = [...(rules.data ?? [])].sort((a, b) => a.priority - b.priority);
    const idx = list.findIndex((x) => x.id === r.id);
    const swap = list[idx + dir];
    if (!swap) return;
    const a = await supabase.from("import_rules" as any).update({ priority: swap.priority }).eq("id", r.id);
    const b = await supabase.from("import_rules" as any).update({ priority: r.priority }).eq("id", swap.id);
    if (a.error || b.error) toast.error((a.error ?? b.error)!.message);
    else refresh();
  };

  const onDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("import_rules" as any).delete().eq("id", deleting.id);
    if (error) toast.error(error.message);
    else { toast.success("Regel gelöscht"); setDeleting(null); refresh(); }
  };

  const runOnAll = async () => {
    if (!user) return;
    const active = (rules.data ?? []).filter((r) => r.active);
    if (active.length === 0) { toast.error("Keine aktiven Regeln"); return; }
    setApplyProgress({ done: 0, total: 0, updated: 0 });
    const { data: txs, error } = await supabase
      .from("transactions")
      .select("id,note,purpose,amount,kind,category_id,loan_account_id")
      .eq("user_id", user.id);
    if (error) { toast.error(error.message); setApplyProgress(null); return; }
    const all = txs ?? [];
    const batch = 50;
    let updated = 0;
    setApplyProgress({ done: 0, total: all.length, updated: 0 });
    for (let i = 0; i < all.length; i += batch) {
      const chunk = all.slice(i, i + batch);
      await Promise.all(chunk.map(async (t: any) => {
        const before = { category_id: t.category_id, kind: t.kind, loan_account_id: t.loan_account_id };
        const after = applyRules({
          note: t.note, purpose: t.purpose, amount: Number(t.amount), kind: t.kind,
          category_id: t.category_id, loan_account_id: t.loan_account_id,
        }, active);
        const patch: any = {};
        if (after.category_id !== before.category_id) patch.category_id = after.category_id;
        if (after.kind !== before.kind) patch.kind = after.kind;
        if (after.loan_account_id !== before.loan_account_id) patch.loan_account_id = after.loan_account_id;
        if (Object.keys(patch).length > 0) {
          const { error: e2 } = await supabase.from("transactions").update(patch).eq("id", t.id);
          if (!e2) updated++;
        }
      }));
      setApplyProgress({ done: Math.min(i + batch, all.length), total: all.length, updated });
    }
    toast.success(`${updated} Transaktion(en) aktualisiert`);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    setTimeout(() => { setApplyProgress(null); setApplyOpen(false); }, 800);
  };

  const sorted = [...(rules.data ?? [])].sort((a, b) => a.priority - b.priority);
  const catName = (id: string | null) => categories.data?.find((c) => c.id === id)?.name ?? "—";
  const loanName = (id: string | null) => loanAccounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Regeln</h2>
          <p className="text-xs text-muted-foreground">Automatische Kategorisierung & Typ-Zuweisung beim Import sowie auf bestehende Buchungen.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setApplyOpen(true)} disabled={sorted.filter((r) => r.active).length === 0}>
            <Play className="mr-2 h-4 w-4" /> Auf alle Buchungen anwenden
          </Button>
          <Button size="sm" onClick={() => setEditing({ name: "", active: true, priority: (sorted[sorted.length - 1]?.priority ?? 100) + 10, condition_field: "note", condition_op: "contains", condition_value: "", action_category_id: null, action_kind: null, action_loan_account_id: null })}>
            <Plus className="mr-2 h-4 w-4" /> Neue Regel
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Regeln. Lege eine an, um Buchungen automatisch zu kategorisieren.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded border border-border p-3">
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(r, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(r, 1)} disabled={i === sorted.length - 1}><ArrowDown className="h-3 w-3" /></Button>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Prio {r.priority}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Wenn <b>{FIELD_LABEL[r.condition_field]}</b> {OP_LABEL[r.condition_op]} <b>„{r.condition_value}"</b> →{" "}
                  {r.action_kind ? `Typ: ${r.action_kind} ` : ""}
                  {r.action_category_id ? `Kategorie: ${catName(r.action_category_id)} ` : ""}
                  {r.action_loan_account_id ? `Kredit: ${loanName(r.action_loan_account_id)}` : ""}
                  {!r.action_kind && !r.action_category_id && !r.action_loan_account_id ? "keine Aktion" : ""}
                </div>
              </div>
              <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
              <Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing && (
          <RuleEditDialog
            rule={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); refresh(); }}
          />
        )}
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regel „{deleting?.name}" löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={applyOpen} onOpenChange={(o) => { if (!applyProgress) setApplyOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regeln auf alle bestehenden Transaktionen anwenden</DialogTitle>
          </DialogHeader>
          {applyProgress ? (
            <div className="space-y-2">
              <Progress value={applyProgress.total > 0 ? (applyProgress.done / applyProgress.total) * 100 : 0} />
              <p className="text-sm text-muted-foreground">{applyProgress.done} / {applyProgress.total} verarbeitet · {applyProgress.updated} aktualisiert</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Alle aktiven Regeln werden in Batches auf jede bestehende Buchung angewendet. Bereits gesetzte Felder werden überschrieben, wenn eine Regel sie ändert.</p>
          )}
          <DialogFooter>
            {!applyProgress && <Button variant="outline" onClick={() => setApplyOpen(false)}>Abbrechen</Button>}
            {!applyProgress && <Button onClick={runOnAll}>Jetzt anwenden</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RuleEditDialog({ rule, onClose, onSaved }: { rule: Partial<ImportRule>; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const categories = useCategories();
  const accounts = useAccounts();
  const [name, setName] = useState(rule.name ?? "");
  const [active, setActive] = useState(rule.active ?? true);
  const [priority, setPriority] = useState(rule.priority ?? 100);
  const [field, setField] = useState<ConditionField>((rule.condition_field as ConditionField) ?? "note");
  const [op, setOp] = useState<ConditionOp>((rule.condition_op as ConditionOp) ?? "contains");
  const [value, setValue] = useState(rule.condition_value ?? "");
  const [actionKind, setActionKind] = useState<ActionKind | "none">((rule.action_kind as ActionKind) ?? "none");
  const [actionCategory, setActionCategory] = useState<string>(rule.action_category_id ?? "none");
  const [actionLoan, setActionLoan] = useState<string>(rule.action_loan_account_id ?? "none");
  const [busy, setBusy] = useState(false);

  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "darlehen");

  const opsForField: ConditionOp[] = field === "amount" ? ["eq", "gt", "lt"] : field === "kind" ? ["equals"] : ["contains", "equals"];

  const save = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error("Name erforderlich"); return; }
    if (!value.trim()) { toast.error("Bedingungs-Wert erforderlich"); return; }
    setBusy(true);
    const payload: any = {
      user_id: user.id,
      name: name.trim(),
      active,
      priority,
      condition_field: field,
      condition_op: op,
      condition_value: value.trim(),
      action_category_id: actionCategory === "none" ? null : actionCategory,
      action_kind: actionKind === "none" ? null : actionKind,
      action_loan_account_id: actionLoan === "none" ? null : actionLoan,
    };
    const { error } = rule.id
      ? await supabase.from("import_rules" as any).update(payload).eq("id", rule.id)
      : await supabase.from("import_rules" as any).insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onSaved(); }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{rule.id ? "Regel bearbeiten" : "Neue Regel"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. AOK → Versicherung" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Aktiv</Label>
            <div className="text-xs text-muted-foreground">Inaktive Regeln werden ignoriert</div>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <div>
          <Label>Priorität</Label>
          <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          <p className="mt-1 text-xs text-muted-foreground">Niedrigere Werte zuerst. Erste passende Regel pro Feld gewinnt.</p>
        </div>

        <div className="rounded border border-border p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bedingung</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Feld</Label>
              <Select value={field} onValueChange={(v) => { setField(v as ConditionField); setOp(v === "amount" ? "eq" : v === "kind" ? "equals" : "contains"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_LABEL) as ConditionField[]).map((k) => <SelectItem key={k} value={k}>{FIELD_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Operator</Label>
              <Select value={op} onValueChange={(v) => setOp(v as ConditionOp)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {opsForField.map((k) => <SelectItem key={k} value={k}>{OP_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wert</Label>
              {field === "kind" ? (
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Einnahme</SelectItem>
                    <SelectItem value="expense">Ausgabe</SelectItem>
                    <SelectItem value="transfer">Umbuchung</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={field === "amount" ? "z.B. 100" : "z.B. AOK"} />
              )}
            </div>
          </div>
        </div>

        <div className="rounded border border-border p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aktion (mindestens eine)</div>
          <div>
            <Label>Kategorie setzen</Label>
            <Select value={actionCategory} onValueChange={setActionCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— keine —</SelectItem>
                {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name} ({c.kind})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Typ setzen</Label>
            <Select value={actionKind} onValueChange={(v) => setActionKind(v as ActionKind | "none")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— keiner —</SelectItem>
                <SelectItem value="income">Einnahme</SelectItem>
                <SelectItem value="expense">Ausgabe</SelectItem>
                <SelectItem value="transfer">Umbuchung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Verknüpfter Kredit / Darlehen setzen</Label>
            <Select value={actionLoan} onValueChange={setActionLoan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— keiner —</SelectItem>
                {loanAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.type === "darlehen" ? "🤝" : "🏦"} {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button onClick={save} disabled={busy}>Speichern</Button>
      </DialogFooter>
    </DialogContent>
  );
}
