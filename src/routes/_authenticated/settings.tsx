import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">Konto und App-Einstellungen</p>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium">Profil</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">E-Mail</dt><dd>{user?.email}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Benutzer-ID</dt><dd className="font-mono text-xs">{user?.id?.slice(0, 8)}…</dd></div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium">Sitzung</h2>
        <Button variant="outline" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />Abmelden
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-medium">Geplante Module</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Wiederkehrende Ausgaben (Abos, Miete) mit Erinnerungen</li>
          <li>Kredite (Restschuld, Verlauf)</li>
          <li>Kreditkarten mit Limit-Auslastung</li>
          <li>CSV-Import (Notion/Excel)</li>
          <li>Jahresberichte</li>
        </ul>
      </Card>
    </div>
  );
}
