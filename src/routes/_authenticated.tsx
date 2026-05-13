import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [session, loading, navigate]);

  useEffect(() => {
    if (!session || ranRef.current) return;
    ranRef.current = true;
    (supabase as any).rpc("process_due_recurring").then(({ data, error }: any) => {
      if (error) return;
      if (Number(data ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["account_balances"] });
        qc.invalidateQueries({ queryKey: ["monthly_summary"] });
        qc.invalidateQueries({ queryKey: ["recurring_rules"] });
      }
    });
  }, [session, qc]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Lädt…</p>
      </div>
    );
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
