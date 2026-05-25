import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCategories } from "@/lib/queries";
import { useCategoryKeywords, deriveKeyword } from "@/lib/category-suggest";
import { toast } from "sonner";

export type LearnPrompt = {
  description: string | null;
  purpose: string | null;
  categoryId: string;
  previousCategoryId: string | null;
};

export function LearnKeywordDialog({
  prompt,
  onClose,
}: {
  prompt: LearnPrompt | null;
  onClose: () => void;
}) {
  const open = prompt !== null;
  const { user } = useAuth();
  const qc = useQueryClient();
  const cats = useCategories();
  const kws = useCategoryKeywords();
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);

  const cat = useMemo(
    () => (cats.data ?? []).find((c) => c.id === prompt?.categoryId) ?? null,
    [cats.data, prompt?.categoryId],
  );

  useEffect(() => {
    if (prompt) {
      setKeyword(deriveKeyword(prompt.description, prompt.purpose) ?? "");
    }
  }, [prompt]);

  if (!prompt) return null;

  const saveLearned = async () => {
    if (!user) return;
    const kw = keyword.trim().toLowerCase();
    if (!kw) { toast.error("Keyword darf nicht leer sein"); return; }
    setBusy(true);

    // Correction case: if user moved away from a previous category, remove
    // learned/user keywords (matching this exact keyword) that pointed there
    // so they don't fight the new mapping going forward.
    if (prompt.previousCategoryId && prompt.previousCategoryId !== prompt.categoryId) {
      const stale = (kws.data ?? []).filter(
        (k) =>
          k.category_id === prompt.previousCategoryId &&
          k.keyword.trim().toLowerCase() === kw &&
          (k.source ?? "user") !== "default",
      );
      if (stale.length > 0) {
        const ids = stale.map((s) => s.id);
        await supabase.from("category_keywords" as any).delete().in("id", ids);
      }
    }

    const { error } = await supabase.from("category_keywords" as any).upsert(
      { user_id: user.id, category_id: prompt.categoryId, keyword: kw, source: "learned" },
      { onConflict: "user_id,keyword,category_id", ignoreDuplicates: false } as any,
    );
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Gemerkt: „${kw}" → ${cat?.icon ?? ""} ${cat?.name ?? ""}`);
    qc.invalidateQueries({ queryKey: ["category_keywords"] });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />Zuordnung merken?
          </DialogTitle>
          <DialogDescription>
            Soll diese Zuordnung nur für diese Transaktion gelten, oder soll die App das für alle
            zukünftigen Transaktionen mit ähnlicher Beschreibung merken?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Beschreibung</div>
            <div className="font-medium">{prompt.description || prompt.purpose || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Neue Kategorie</div>
            {cat && (
              <Badge variant="secondary" style={{ backgroundColor: `${cat.color}20`, color: cat.color, borderColor: `${cat.color}40` }}>
                {cat.icon} {cat.name}
              </Badge>
            )}
          </div>
        </div>

        <div>
          <Label className="text-xs">Keyword, das gemerkt werden soll</Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="z.B. rewe" />
          <p className="mt-1 text-xs text-muted-foreground">
            Wird beim Import und Vorschlag verglichen — case-insensitive, Teilübereinstimmung.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Nur diese Transaktion</Button>
          <Button onClick={saveLearned} disabled={busy}>
            <Sparkles className="mr-2 h-4 w-4" />Immer merken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
