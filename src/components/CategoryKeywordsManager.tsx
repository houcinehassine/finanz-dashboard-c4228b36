import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/lib/queries";
import { useCategoryKeywords, buildDefaultKeywordRows } from "@/lib/category-suggest";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function CategoryKeywordsManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cats = useCategories();
  const kws = useCategoryKeywords();

  const [newKeyword, setNewKeyword] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["category_keywords"] });

  const categories = (cats.data ?? []).filter((c) => !c.archived);
  const catById = useMemo(() => {
    const m = new Map<string, { name: string; icon: string }>();
    for (const c of cats.data ?? []) m.set(c.id, { name: c.name, icon: c.icon });
    return m;
  }, [cats.data]);

  const grouped = useMemo(() => {
    const g = new Map<string, any[]>();
    for (const k of (kws.data ?? [])) {
      const arr = g.get(k.category_id) ?? [];
      arr.push(k);
      g.set(k.category_id, arr);
    }
    return g;
  }, [kws.data]);

  const addKeyword = async () => {
    if (!user) return;
    const kw = newKeyword.trim();
    if (!kw || !newCategoryId) { toast.error("Keyword und Kategorie wählen"); return; }
    const { error } = await supabase.from("category_keywords" as any).insert({
      user_id: user.id, category_id: newCategoryId, keyword: kw,
    });
    if (error) { toast.error(error.message); return; }
    setNewKeyword("");
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("category_keywords" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const seedDefaults = async () => {
    if (!user) return;
    setBusy(true);
    const rows = buildDefaultKeywordRows(user.id, cats.data ?? []);
    if (rows.length === 0) {
      toast.info("Keine passenden Standard-Kategorien gefunden");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("category_keywords" as any).upsert(rows, { onConflict: "user_id,keyword,category_id", ignoreDuplicates: true } as any);
    if (error) toast.error(error.message);
    else { toast.success(`${rows.length} Standard-Keywords geladen`); refresh(); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Keyword-Matching</h2>
            <p className="text-xs text-muted-foreground">
              Wird beim CSV-Import nach den Regeln und über „Kategorie vorschlagen" verwendet. Vergleich ist
              case-insensitive und findet Teilübereinstimmungen.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={seedDefaults} disabled={busy}>
            <Sparkles className="mr-2 h-4 w-4" />Standardliste laden
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label className="text-xs">Keyword</Label>
            <Input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder="z.B. rewe" />
          </div>
          <div>
            <Label className="text-xs">Kategorie</Label>
            <Select value={newCategoryId} onValueChange={setNewCategoryId}>
              <SelectTrigger><SelectValue placeholder="Kategorie wählen" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addKeyword}><Plus className="mr-2 h-4 w-4" />Hinzufügen</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">
          Aktive Keywords <span className="text-muted-foreground">({kws.data?.length ?? 0})</span>
        </h2>
        {(kws.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Keywords. Lade die Standardliste oder füge eigene hinzu.
          </p>
        ) : (
          <div className="space-y-3">
            {Array.from(grouped.entries()).map(([catId, list]) => {
              const c = catById.get(catId);
              return (
                <div key={catId}>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {c?.icon} {c?.name ?? "Unbekannt"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(list as any[]).map((k) => {
                      const src = (k.source ?? "user") as "user" | "learned" | "default";
                      const tone = src === "learned"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : src === "default"
                          ? "border-muted-foreground/30 bg-muted text-muted-foreground"
                          : "";
                      return (
                        <Badge key={k.id} variant="secondary" className={`gap-1 pr-1 ${tone}`} title={
                          src === "learned" ? "Automatisch gelernt" : src === "default" ? "Standardliste" : "Manuell"
                        }>
                          {src === "learned" && <Sparkles className="h-3 w-3" />}
                          {k.keyword}
                          <button
                            onClick={() => remove(k.id)}
                            className="ml-1 rounded-sm p-0.5 hover:bg-destructive/20"
                            aria-label="Entfernen"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
