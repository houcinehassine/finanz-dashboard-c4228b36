import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCategories, type Category } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

export function CategoriesManager() {
  const cats = useCategories();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });

  const onDelete = async (id: string) => {
    if (!confirm("Kategorie löschen? Transaktionen behalten 'Ohne Kategorie'.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); refresh(); }
  };

  const toggleActive = async (c: Category) => {
    const { error } = await supabase.from("categories").update({ archived: !c.archived }).eq("id", c.id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const all = cats.data ?? [];
  const system = all.filter((c) => c.is_system);
  const own = all.filter((c) => !c.is_system);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Kategorien</h2>
          <p className="text-sm text-muted-foreground">System-Kategorien sind fest verankert. Eigene Kategorien kannst du frei erstellen.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); refresh(); } }}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={() => setEditing({ kind: "expense", color: "#64748b", icon: "🏷️" })}>
              <Plus className="mr-2 h-4 w-4" />Neue Kategorie
            </Button>
          </DialogTrigger>
          <CategoryDialog key={editing?.id ?? "new"} category={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} />
        </Dialog>
      </div>

      <Group label="System" locked emptyHint="Keine System-Kategorien.">
        {system.map((c) => (
          <CategoryRow key={c.id} c={c} system onToggle={() => toggleActive(c)} />
        ))}
      </Group>

      <Group label="Eigene" emptyHint="Noch keine eigenen Kategorien.">
        {own.map((c) => (
          <CategoryRow key={c.id} c={c} onToggle={() => toggleActive(c)} onEdit={() => { setEditing(c); setOpen(true); }} onDelete={() => onDelete(c.id)} />
        ))}
      </Group>
    </div>
  );
}

function Group({ label, locked, emptyHint, children }: { label: string; locked?: boolean; emptyHint: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {locked && <Lock className="h-3 w-3" />}
        {label}
      </div>
      {arr.length === 0 ? (
        <Card className="p-3 text-sm text-muted-foreground">{emptyHint}</Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
      )}
    </div>
  );
}

function CategoryRow({
  c,
  system,
  onToggle,
  onEdit,
  onDelete,
}: {
  c: Category;
  system?: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ring-2 ring-background"
          style={{ backgroundColor: `${c.color}22`, color: c.color }}
        >
          {c.icon || "🏷️"}
        </span>
        <div className="min-w-0">
          <div className={`truncate text-sm font-medium ${c.archived ? "line-through text-muted-foreground" : ""}`}>
            {c.name}
          </div>
          <Badge variant="secondary" className="mt-0.5 text-[10px]">
            {c.kind === "income" ? "Einnahme" : "Ausgabe"}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Switch checked={!c.archived} onCheckedChange={onToggle} />
        {system ? (
          <Button size="icon" variant="ghost" disabled><Lock className="h-4 w-4" /></Button>
        ) : (
          <>
            <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </>
        )}
      </div>
    </Card>
  );
}

function CategoryDialog({ category, onClose }: { category: Partial<Category> | null; onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<Category["kind"]>(category?.kind ?? "expense");
  const [color, setColor] = useState(category?.color ?? "#64748b");
  const [icon, setIcon] = useState(category?.icon ?? "🏷️");
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
          <Select value={kind} onValueChange={(v) => setKind(v as Category["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Einnahme</SelectItem>
              <SelectItem value="expense">Ausgabe</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Farbe</Label>
          <div className="flex items-center gap-3">
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-base ring-2 ring-background"
              style={{ backgroundColor: `${color}22`, color }}
            >
              {icon || "🏷️"}
            </span>
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 font-mono text-xs" />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Speichern</Button>
      </form>
    </DialogContent>
  );
}
