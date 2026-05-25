import { useMemo, useRef, useState } from "react";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts, useCategories, type Account, type Category } from "@/lib/queries";
import { useImportRules, applyRules } from "@/lib/rules";
import { useCategoryKeywords, suggestCategory } from "@/lib/category-suggest";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

// Only fields actually mapped from CSV columns. Account & loan are picked separately.
type FieldKey = "kind" | "note" | "purpose" | "amount" | "occurred_on" | "category";

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "occurred_on", label: "Datum", required: true },
  { key: "amount", label: "Betrag", required: true },
  { key: "note", label: "Beschreibung" },
  { key: "purpose", label: "Verwendungszweck" },
  { key: "kind", label: "Typ (Einnahme/Ausgabe)" },
  { key: "category", label: "Kategorie" },
];

const SKIP = "__skip__";
const NONE = "__none__";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; } else { inQ = false; }
      } else val += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === "," || c === ";" || c === "\t") { cur.push(val); val = ""; }
      else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
      else if (c === "\r") { /* skip */ }
      else val += c;
    }
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

function parseDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const de = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
  if (de) {
    let [, d, m, y] = de;
    if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(t);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseAmount(s: string): number | null {
  if (!s) return null;
  let t = s.replace(/[€$\s]/g, "").trim();
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return isNaN(n) ? null : n;
}

function inferKind(s: string): "income" | "expense" | "transfer" | null {
  const t = s.toLowerCase().trim();
  if (!t) return null;
  if (["einnahme", "income", "credit", "gutschrift", "haben"].some((k) => t.includes(k))) return "income";
  if (["ausgabe", "expense", "debit", "lastschrift", "soll"].some((k) => t.includes(k))) return "expense";
  if (["transfer", "umbuchung"].some((k) => t.includes(k))) return "transfer";
  return null;
}

export function CsvImportDialog({
  defaultAccountId,
  requireAccountChoice = false,
  onClose,
}: {
  defaultAccountId?: string;
  requireAccountChoice?: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const accounts = useAccounts();
  const cats = useCategories();
  const rules = useImportRules();
  const keywords = useCategoryKeywords();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number | null>>({
    occurred_on: null, note: null, purpose: null, amount: null, kind: null, category: null,
  });
  const [targetAccountId, setTargetAccountId] = useState<string>(defaultAccountId ?? "");
  const [targetLoanId, setTargetLoanId] = useState<string>(NONE);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const accountsList: Account[] = accounts.data ?? [];
  const categoriesList: Category[] = cats.data ?? [];
  const bankAccounts = accountsList.filter((a) => !a.archived && (a.type === "checking" || a.type === "savings" || a.type === "clearing" || a.type === "credit_card"));
  const loanAccounts = accountsList.filter((a) => !a.archived && (a.type === "loan" || a.type === "darlehen"));

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) { toast.error("Datei ist leer"); return; }
    const head = parsed[0];
    setHeaders(head);
    setRows(parsed.slice(1));
    const auto: Record<FieldKey, number | null> = { ...mapping };
    head.forEach((h, i) => {
      const l = h.toLowerCase().trim();
      if (auto.occurred_on === null && /(datum|date|buchungstag|valuta)/.test(l)) auto.occurred_on = i;
      else if (auto.amount === null && /(betrag|amount|summe|wert)/.test(l)) auto.amount = i;
      else if (auto.purpose === null && /(verwendungszweck|purpose|zweck)/.test(l)) auto.purpose = i;
      else if (auto.note === null && /(beschreibung|note|notiz|description|buchungstext|name|empfänger|auftraggeber)/.test(l)) auto.note = i;
      else if (auto.kind === null && /(typ|kind|art)/.test(l)) auto.kind = i;
      else if (auto.category === null && /(kategorie|category)/.test(l)) auto.category = i;
    });
    setMapping(auto);
    setStep(2);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const canImport = mapping.occurred_on !== null && mapping.amount !== null && !!targetAccountId;

  const doImport = async () => {
    if (!user || !canImport) return;
    setImporting(true);

    // 1. Build a mutable category lookup (lower-case name -> category).
    const catByName = new Map<string, Category>(categoriesList.map((c) => [c.name.toLowerCase(), c]));

    // 2. Collect needed-but-missing category names (kind decided per-row later).
    const needed = new Map<string, { name: string; kind: "income" | "expense" }>();
    const parsedRows: Array<{
      occurred_on: string;
      amount: number;
      kind: "income" | "expense" | "transfer";
      note: string | null;
      purpose: string | null;
      catName: string | null;
    }> = [];
    const errors: string[] = [];

    rows.forEach((r, idx) => {
      const get = (k: FieldKey) => (mapping[k] !== null ? (r[mapping[k]!] ?? "").trim() : "");
      const date = parseDate(get("occurred_on"));
      const rawAmt = parseAmount(get("amount"));
      if (!date || rawAmt === null) { errors.push(`Zeile ${idx + 2}: Datum/Betrag ungültig`); return; }
      const kind = inferKind(get("kind")) || (rawAmt < 0 ? "expense" : "income");
      const amount = Math.abs(rawAmt);
      const catName = get("category").trim();
      if (catName && !catByName.has(catName.toLowerCase())) {
        const key = catName.toLowerCase();
        const decidedKind: "income" | "expense" = kind === "transfer" ? "expense" : kind;
        if (!needed.has(key)) needed.set(key, { name: catName, kind: decidedKind });
      }
      parsedRows.push({
        occurred_on: date,
        amount,
        kind,
        note: get("note") || null,
        purpose: get("purpose") || null,
        catName: catName || null,
      });
    });

    // 3. Create missing categories in bulk.
    if (needed.size > 0) {
      const toCreate = Array.from(needed.values()).map((c) => ({
        user_id: user.id,
        name: c.name,
        kind: c.kind,
        color: "#64748b",
        icon: "🏷️",
        is_system: false,
      }));
      const { data: created, error: catErr } = await supabase
        .from("categories")
        .insert(toCreate)
        .select("id,name,kind,color,icon,archived,is_system");
      if (catErr) {
        toast.error("Kategorien konnten nicht angelegt werden: " + catErr.message);
        setImporting(false);
        return;
      }
      for (const c of (created ?? []) as Category[]) {
        catByName.set(c.name.toLowerCase(), c);
      }
    }

    // 4. Build transaction inserts + apply rules.
    const rulesList = rules.data ?? [];
    const baseLoanId = targetLoanId !== NONE ? targetLoanId : null;
    const toInsert = parsedRows.map((p) => {
      const cat = p.catName ? catByName.get(p.catName.toLowerCase()) ?? null : null;
      const row: any = {
        user_id: user.id,
        account_id: targetAccountId,
        category_id: cat?.id ?? null,
        loan_account_id: baseLoanId,
        kind: p.kind,
        amount: p.amount,
        occurred_on: p.occurred_on,
        note: p.note,
        purpose: p.purpose,
        is_anyfin: false,
        transfer_to_account_id: null,
      };
      // Rules engine (operates on note/purpose/amount/kind, may set category/kind/loan)
      const after = applyRules(
        { note: row.note, purpose: row.purpose, amount: row.amount, kind: row.kind, category_id: row.category_id, loan_account_id: row.loan_account_id },
        rulesList,
      );
      row.category_id = after.category_id;
      row.kind = after.kind ?? row.kind;
      row.loan_account_id = after.loan_account_id ?? null;
      // Keyword fallback: if still no category, try the keyword list.
      if (!row.category_id) {
        const suggested = suggestCategory(row.note, row.purpose, keywords.data ?? []);
        if (suggested) row.category_id = suggested;
      }
      // Transfer rows would need transfer_to_account_id; we never set it via CSV.
      if (row.kind === "transfer") row.kind = "expense";
      return row;
    });

    if (toInsert.length === 0) {
      toast.error("Keine gültigen Zeilen");
      setImporting(false);
      return;
    }
    const { error } = await supabase.from("transactions").insert(toInsert);
    if (error) { toast.error(error.message); setImporting(false); return; }
    setImported(toInsert.length);
    if (errors.length) toast.warning(`${errors.length} Zeilen übersprungen`);
    setImporting(false);
    setStep(3);
  };

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>CSV importieren — Schritt {step} von 3</DialogTitle>
        <DialogDescription>
          {step === 1 && "Wähle eine CSV-Datei aus"}
          {step === 2 && "Ordne die Spalten den Feldern zu und wähle das Zielkonto"}
          {step === 3 && "Import abgeschlossen"}
        </DialogDescription>
      </DialogHeader>

      {step === 1 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/60"}`}
        >
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <div className="font-medium">CSV-Datei hier ablegen oder klicken</div>
          <div className="mt-1 text-xs text-muted-foreground">Headerzeile wird automatisch erkannt</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Zielkonto</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  Konto <span className="text-red-500">*</span>
                  {requireAccountChoice && <span className="ml-1 text-muted-foreground">(Pflicht)</span>}
                </Label>
                <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                  <SelectTrigger><SelectValue placeholder="Konto wählen" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Verknüpfter Kredit / Darlehen (optional)</Label>
                <Select value={targetLoanId} onValueChange={setTargetLoanId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Keiner —</SelectItem>
                    {loanAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Alle importierten Buchungen werden diesem Konto zugeordnet und erscheinen auch in „Alle Transaktionen".</p>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Spalten zuordnen</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-medium">
                    {f.label}{f.required && <span className="text-red-500"> *</span>}
                  </label>
                  <Select
                    value={mapping[f.key] === null ? SKIP : String(mapping[f.key])}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === SKIP ? null : Number(v) }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Spalte wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— überspringen —</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>{h || `Spalte ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Vorschau ({rows.length} Zeilen)</div>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>{headers.map((h, i) => <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t">
                      {headers.map((_, j) => <td key={j} className="px-2 py-1">{r[j] ?? ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(rules.data?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              ℹ️ {rules.data!.filter((r) => r.active).length} aktive Regel(n) werden vor dem Speichern automatisch angewendet.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <div className="mt-3 text-lg font-semibold">{imported} Buchungen importiert</div>
          <div className="text-sm text-muted-foreground">Die neuen Buchungen sind diesem Konto zugeordnet und in „Alle Transaktionen" sichtbar.</div>
        </div>
      )}

      <DialogFooter>
        {step === 2 && (
          <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Zurück</Button>
        )}
        {step === 1 && <Button variant="outline" onClick={onClose}>Abbrechen</Button>}
        {step === 2 && (
          <Button onClick={doImport} disabled={!canImport || importing}>
            {importing ? "Importiere…" : <>Importieren <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
        )}
        {step === 3 && <Button onClick={onClose}>Fertig</Button>}
      </DialogFooter>
    </DialogContent>
  );
}
