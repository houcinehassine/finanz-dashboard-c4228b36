import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useAccounts, useCategories } from "@/lib/queries";
import {
  useImportRules,
  applyRules,
  matchesRule,
  normalizeRule,
  type ImportRule,
  type ConditionField,
  type ConditionOp,
  type ActionKind,
  type Logic,
  type RuleCondition,
} from "@/lib/rules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Pencil, Trash2, Plus, ArrowUp, ArrowDown, Play, X, Lightbulb } from "lucide-react";
import { toast } from "sonner";

const FIELD_LABEL: Record<ConditionField, string> = {
  note: "Beschreibung",
  category: "Kategorie",
  kind: "Typ",
  purpose: "Verwendungszweck",
  amount: "Betrag",
  account: "Bank / Konto",
};
const OP_LABEL: Record<ConditionOp, string> = {
  contains: "enthält",
  starts_with: "beginnt mit",
  equals: "ist genau",
  eq: "ist genau",
  gt: "größer als",
  lt: "kleiner als",
};

function opsFor(field: ConditionField): ConditionOp[] {
  if (field === "amount") return ["eq", "gt", "lt"];
  if (field === "kind" || field === "category" || field === "account") return ["equals"];
  return ["contains", "starts_with", "equals"];
}

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
    if (error) toast.error(error.message); else refresh();
  };

  const move = async (r: ImportRule, dir: -1 | 1) => {
    const list = [...(rules.data ?? [])].sort((a, b) => a.priority - b.priority);
    const idx = list.findIndex((x) => x.id === r.id);
    const swap = list[idx + dir];
    if (!swap) return;
    const a = await supabase.from("import_rules" as any).update({ priority: swap.priority }).eq("id", r.id);
    const b = await supabase.from("import_rules" as any).update({ priority: r.priority }).eq("id", swap.id);
    if (a.error || b.error) toast.error((a.error ?? b.error)!.message); else refresh();
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
      .select("id,note,purpose,amount,kind,category_id,account_id,loan_account_id,transfer_to_account_id")
      .eq("user_id", user.id);
    if (error) { toast.error(error.message); setApplyProgress(null); return; }
    const all = txs ?? [];
    const batch = 50;
    let updated = 0;
    setApplyProgress({ done: 0, total: all.length, updated: 0 });
    for (let i = 0; i < all.length; i += batch) {
      const chunk = all.slice(i, i + batch);
      await Promise.all(chunk.map(async (t: any) => {
        const before = {
          note: t.note, category_id: t.category_id, kind: t.kind,
          account_id: t.account_id, loan_account_id: t.loan_account_id,
          transfer_to_account_id: t.transfer_to_account_id,
        };
        const after = applyRules({
          note: t.note, purpose: t.purpose, amount: Number(t.amount), kind: t.kind,
          category_id: t.category_id, account_id: t.account_id,
          loan_account_id: t.loan_account_id, transfer_to_account_id: t.transfer_to_account_id,
        }, active);
        const patch: any = {};
        if (after.note !== before.note) patch.note = after.note;
        if (after.category_id !== before.category_id) patch.category_id = after.category_id;
        if (after.kind !== before.kind) patch.kind = after.kind;
        if (after.account_id !== before.account_id) patch.account_id = after.account_id;
        if (after.loan_account_id !== before.loan_account_id) patch.loan_account_id = after.loan_account_id;
        // transfer_to is only meaningful when kind is transfer
        if (after.kind === "transfer" && after.transfer_to_account_id !== before.transfer_to_account_id) {
          patch.transfer_to_account_id = after.transfer_to_account_id;
        }
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
  const accName = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name ?? "—";
  const loanName = (id: string | null) => loanAccounts.find((a) => a.id === id)?.name ?? "—";

  const summarizeCondition = (c: RuleCondition) => {
    let v = c.value;
    if (c.field === "category") v = catName(c.value);
    else if (c.field === "account") v = accName(c.value);
    return `${FIELD_LABEL[c.field]} ${OP_LABEL[c.op]} „${v}"`;
  };

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
          <Button size="sm" onClick={() => setEditing({ name: "", active: true, priority: (sorted[sorted.length - 1]?.priority ?? 100) + 10, logic: "AND", conditions: [{ field: "note", op: "contains", value: "" }], action_note: null, action_category_id: null, action_kind: null, action_account_id: null, action_transfer_to_account_id: null, action_loan_account_id: null })}>
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
                  Wenn {r.conditions.map((c, idx) => (
                    <span key={idx}>
                      {idx > 0 && <span className="mx-1 font-semibold text-primary">{r.logic}</span>}
                      {summarizeCondition(c)}
                    </span>
                  ))} →{" "}
                  {r.action_note ? `Beschreibung: „${r.action_note}" ` : ""}
                  {r.action_kind ? `Typ: ${r.action_kind} ` : ""}
                  {r.action_category_id ? `Kategorie: ${catName(r.action_category_id)} ` : ""}
                  {r.action_account_id ? `Konto: ${accName(r.action_account_id)} ` : ""}
                  {r.action_transfer_to_account_id ? `Ziel: ${accName(r.action_transfer_to_account_id)} ` : ""}
                  {r.action_loan_account_id ? `Kredit: ${loanName(r.action_loan_account_id)}` : ""}
                  {!r.action_note && !r.action_kind && !r.action_category_id && !r.action_account_id && !r.action_transfer_to_account_id && !r.action_loan_account_id ? "keine Aktion" : ""}
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
            <p className="text-sm text-muted-foreground">Alle aktiven Regeln werden in Batches auf jede bestehende Buchung angewendet.</p>
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
  const [logic, setLogic] = useState<Logic>((rule.logic as Logic) ?? "AND");
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule.conditions && rule.conditions.length > 0
      ? rule.conditions
      : [{ field: "note", op: "contains", value: "" }],
  );
  const [actionNote, setActionNote] = useState(rule.action_note ?? "");
  const [actionKind, setActionKind] = useState<ActionKind | "none">((rule.action_kind as ActionKind) ?? "none");
  const [actionCategory, setActionCategory] = useState<string>(rule.action_category_id ?? "none");
  const [actionAccount, setActionAccount] = useState<string>(rule.action_account_id ?? "none");
  const [actionTransferTo, setActionTransferTo] = useState<string>(rule.action_transfer_to_account_id ?? "none");
  const [actionLoan, setActionLoan] = useState<string>(rule.action_loan_account_id ?? "none");
  const [busy, setBusy] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);

  const loanAccounts = (accounts.data ?? []).filter((a) => a.type === "loan" || a.type === "darlehen");
  const regularAccounts = (accounts.data ?? []).filter((a) => a.type !== "loan" && a.type !== "darlehen");

  const updateCondition = (idx: number, patch: Partial<RuleCondition>) => {
    setConditions((cs) => cs.map((c, i) => {
      if (i !== idx) return c;
      const next = { ...c, ...patch };
      // reset op if no longer valid for new field
      if (patch.field && !opsFor(patch.field).includes(next.op)) {
        next.op = opsFor(patch.field)[0];
        next.value = "";
      }
      return next;
    }));
  };
  const addCondition = () => setConditions((cs) => [...cs, { field: "note", op: "contains", value: "" }]);
  const removeCondition = (idx: number) => setConditions((cs) => cs.filter((_, i) => i !== idx));

  // Live preview: count how many transactions match the current conditions
  useEffect(() => {
    if (!user) return;
    const valid = conditions.filter((c) => c.value.trim() !== "");
    if (valid.length === 0) { setMatchCount(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id,note,purpose,amount,kind,category_id,account_id")
        .eq("user_id", user.id)
        .limit(10000);
      if (cancelled) return;
      const pseudoRule = normalizeRule({
        id: "preview", user_id: user.id, name: "preview", active: true, priority: 0,
        logic, conditions: valid,
        action_note: null, action_category_id: null, action_kind: null,
        action_account_id: null, action_transfer_to_account_id: null, action_loan_account_id: null,
      });
      const count = (data ?? []).filter((t: any) => matchesRule(pseudoRule, {
        note: t.note, purpose: t.purpose, amount: Number(t.amount), kind: t.kind,
        category_id: t.category_id, account_id: t.account_id,
      })).length;
      setMatchCount(count);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user, conditions, logic]);

  const save = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error("Name erforderlich"); return; }
    const cleanConds = conditions.filter((c) => c.value.trim() !== "");
    if (cleanConds.length === 0) { toast.error("Mindestens eine Bedingung mit Wert erforderlich"); return; }
    const hasAction = actionNote.trim() || actionKind !== "none" || actionCategory !== "none"
      || actionAccount !== "none" || actionTransferTo !== "none" || actionLoan !== "none";
    if (!hasAction) { toast.error("Mindestens eine Aktion erforderlich"); return; }
    setBusy(true);
    const first = cleanConds[0];
    const payload: any = {
      user_id: user.id,
      name: name.trim(),
      active,
      priority,
      logic,
      conditions: cleanConds,
      // keep legacy columns in sync with the first condition for back-compat
      condition_field: first.field,
      condition_op: first.op,
      condition_value: first.value,
      action_note: actionNote.trim() || null,
      action_category_id: actionCategory === "none" ? null : actionCategory,
      action_kind: actionKind === "none" ? null : actionKind,
      action_account_id: actionAccount === "none" ? null : actionAccount,
      action_transfer_to_account_id: actionKind === "transfer" && actionTransferTo !== "none" ? actionTransferTo : null,
      action_loan_account_id: actionLoan === "none" ? null : actionLoan,
    };
    const { error } = rule.id
      ? await supabase.from("import_rules" as any).update(payload).eq("id", rule.id)
      : await supabase.from("import_rules" as any).insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onSaved(); }
  };

  const valueInput = (c: RuleCondition, idx: number) => {
    if (c.field === "kind") {
      return (
        <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
          <SelectTrigger><SelectValue placeholder="Wert wählen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="income">Einnahme</SelectItem>
            <SelectItem value="expense">Ausgabe</SelectItem>
            <SelectItem value="transfer">Umbuchung</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (c.field === "category") {
      return (
        <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
          <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
          <SelectContent>
            {(categories.data ?? []).map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.icon} {cat.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (c.field === "account") {
      return (
        <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
          <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
          <SelectContent>
            {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={c.value}
        onChange={(e) => updateCondition(idx, { value: e.target.value })}
        placeholder={c.field === "amount" ? "z.B. 100" : "Wert eingeben"}
      />
    );
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{rule.id ? "Regel bearbeiten" : "Neue Regel"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
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
          <p className="mt-1 text-xs text-muted-foreground">Niedrigere Werte zuerst.</p>
        </div>

        {/* CONDITIONS */}
        <div className="rounded border border-border bg-muted/30 p-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">Bedingungen</div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
            <div>Feld</div><div>Operator</div><div>Wert</div><div className="w-6" />
          </div>
          {conditions.map((c, idx) => (
            <div key={idx} className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <Select value={c.field} onValueChange={(v) => updateCondition(idx, { field: v as ConditionField })}>
                  <SelectTrigger><SelectValue placeholder="Feld wählen" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_LABEL) as ConditionField[]).map((k) => <SelectItem key={k} value={k}>{FIELD_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={c.op} onValueChange={(v) => updateCondition(idx, { op: v as ConditionOp })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opsFor(c.field).map((op) => <SelectItem key={op} value={op}>{OP_LABEL[op]}</SelectItem>)}
                  </SelectContent>
                </Select>
                {valueInput(c, idx)}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  onClick={() => removeCondition(idx)}
                  disabled={conditions.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {idx < conditions.length - 1 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setLogic(logic === "AND" ? "OR" : "AND")}
                    className="rounded-full border border-primary/40 bg-background px-3 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10"
                  >
                    {logic === "AND" ? "UND" : "ODER"} ⇅
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" size="sm" onClick={addCondition}>
              <Plus className="mr-2 h-4 w-4" /> Bedingung hinzufügen
            </Button>
            <span className="text-xs text-muted-foreground">Erste passende Kombination trifft zu</span>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="rounded border border-border bg-muted/30 p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">Aktion (mindestens eine)</div>
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <Label>Beschreibung setzen</Label>
            <Input value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Beschreibung eingeben" />

            <Label>Kategorie setzen</Label>
            <Select value={actionCategory} onValueChange={setActionCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— keine —</SelectItem>
                {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name} ({c.kind})</SelectItem>)}
              </SelectContent>
            </Select>

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

            {actionKind === "transfer" && (
              <>
                <div /> {/* spacer */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Von:</Label>
                    <Select value={actionAccount} onValueChange={setActionAccount}>
                      <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— keiner —</SelectItem>
                        {regularAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Bis:</Label>
                    <Select value={actionTransferTo} onValueChange={setActionTransferTo}>
                      <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— keiner —</SelectItem>
                        {regularAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {(actionKind === "income" || actionKind === "expense") && (
              <>
                <Label>Konto:</Label>
                <Select value={actionAccount} onValueChange={setActionAccount}>
                  <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— keiner —</SelectItem>
                    {regularAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}

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

        {/* PREVIEW */}
        <div className="flex items-center gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-sm">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Diese Regel würde aktuell{" "}
            <b className="text-foreground">{matchCount ?? "—"}</b>{" "}
            Transaktion{matchCount === 1 ? "" : "en"} treffen
          </span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button onClick={save} disabled={busy}>Speichern</Button>
      </DialogFooter>
    </DialogContent>
  );
}
