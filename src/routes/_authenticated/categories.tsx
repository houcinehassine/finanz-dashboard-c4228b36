import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCategories, type Category } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const cats = useCategories();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [open, setOpen] = useState(false);

  const onDelete = async (id: string) => {
    if (!confirm("Kategorie löschen? Transaktionen behalten 'Ohne Kategorie'.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); qc.invalidateQueries({ queryKey: ["categories"] }); }
  };

  const income = (cats.data ?? []).filter((c) => c.kind === "income");
  const expense = (cats.data ?? []).filter((c) => c.kind === "expense");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kategorien</h1>
          <p className="text-sm text-muted-foreground">Mit Farbe & Emoji für Übersichtlichkeit</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ kind: "expense", color: "#64748b", icon: "💸" })}>
              <Plus className="mr-2 h-4 w-4" />Neu
            </Button>
          </DialogTrigger>
          <CategoryDialog key={editing?.id ?? "new"} category={editing} onClose={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["categories"] }); }} />
        </Dialog>
      </div>

      {[
        { title: "Einnahmen", items: income },
        { title: "Ausgaben", items: expense },
      ].map((s) => (
        <div key={s.title}>
          <h2 className="mb-2 text-sm font-medium">{s.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {s.items.map((c) => (
              <Card key={c.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md text-lg" style={{ backgroundColor: `${c.color}20` }}>
                    {c.icon}
                  </div>
                  <div className="font-medium">{c.name}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </Card>
            ))}
            {s.items.length === 0 && <p className="text-sm text-muted-foreground">Keine Kategorien</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryDialog({ category, onClose }: { category: Partial<Category> | null; onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<Category["kind"]>(category?.kind ?? "expense");
  const [color, setColor] = useState(category?.color ?? "#64748b");
  const [icon, setIcon] = useState(category?.icon ?? "💸");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = { name, kind, color, icon, user_id: user.id };
    const { error } = category?.id
      ? await supabase.from("categories").update(payload).eq("id", category.id)
      : await supabase.from("categories").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Gespeichert"); onClose(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{category?.id ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Typ</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Category["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Einnahme</SelectItem>
              <SelectItem value="expense">Ausgabe</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Emoji</Label>
            <Input maxLength={4} value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>
          <div>
            <Label>Farbe</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
