import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User, Globe, FileUp, ListChecks, Tags, Sun, Moon, Trash2 } from "lucide-react";
import { CategoriesManager } from "@/components/CategoriesManager";
import { RulesManager } from "@/components/RulesManager";
import { usePreferences } from "@/lib/preferences";
import { deleteMyAccount } from "@/lib/account.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = useServerFn(deleteMyAccount);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount({});
      await supabase.auth.signOut();
      toast.success("Konto gelöscht");
      navigate({ to: "/login", replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Löschen fehlgeschlagen");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Einstellungen</div>
        <h1 className="text-3xl font-bold">Einstellungen</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <Card className="p-1">
          <TabsList className="grid w-full grid-cols-2 gap-1 bg-transparent sm:grid-cols-5">
            <TabsTrigger value="profile"><User className="mr-2 h-4 w-4" />Profil</TabsTrigger>
            <TabsTrigger value="language"><Globe className="mr-2 h-4 w-4" />Sprache</TabsTrigger>
            <TabsTrigger value="csv"><FileUp className="mr-2 h-4 w-4" />CSV-Import</TabsTrigger>
            <TabsTrigger value="rules"><ListChecks className="mr-2 h-4 w-4" />Regeln</TabsTrigger>
            <TabsTrigger value="categories"><Tags className="mr-2 h-4 w-4" />Kategorien</TabsTrigger>
          </TabsList>
        </Card>

        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Profil</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">E-Mail</dt><dd>{user?.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Benutzer-ID</dt><dd className="font-mono text-xs">{user?.id?.slice(0, 8)}…</dd></div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Sitzung</h2>
            <Button variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />Abmelden
            </Button>
          </Card>
          <Card className="border-destructive/40 p-5">
            <h2 className="mb-1 text-sm font-semibold text-destructive">Konto löschen</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Löscht dein Konto und alle zugehörigen Daten (Konten, Buchungen, Regeln, Kategorien). Diese Aktion ist unwiderruflich.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" />{deleting ? "Wird gelöscht…" : "Konto endgültig löschen"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Konto wirklich löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Dein Konto ({user?.email}) und alle Daten werden dauerhaft entfernt. Dies kann nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Endgültig löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
        </TabsContent>

        <TabsContent value="language" className="mt-4 space-y-4">
          <AppearanceCard />
        </TabsContent>

        <TabsContent value="csv" className="mt-4">
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold">CSV-Import</h2>
            <p className="mb-3 text-sm text-muted-foreground">Importiere Transaktionen aus einer CSV-Datei (Datum, Betrag, Beschreibung, Kategorie).</p>
            <div className="space-y-2">
              <Label>Datei auswählen</Label>
              <Input type="file" accept=".csv" disabled />
              <p className="text-xs text-muted-foreground">Funktion in Kürze verfügbar.</p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold">Regeln</h2>
            <p className="text-sm text-muted-foreground">Automatische Kategorisierung nach Beschreibungs-Mustern. Bald verfügbar.</p>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoriesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppearanceCard() {
  const { theme, setTheme, lang, setLang, t } = usePreferences();
  return (
    <>
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">{t("settings_appearance")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("settings_theme")}:</span>
          <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" /> {t("theme_light")}
          </Button>
          <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" /> {t("theme_dark")}
          </Button>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">{t("settings_language")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={lang === "de" ? "default" : "outline"} size="sm" onClick={() => setLang("de")}>
            🇩🇪 {t("lang_de")}
          </Button>
          <Button variant={lang === "en" ? "default" : "outline"} size="sm" onClick={() => setLang("en")}>
            🇬🇧 {t("lang_en")}
          </Button>
        </div>
      </Card>
    </>
  );
}
