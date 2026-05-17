import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handle = (s: Session | null) => {
      const newUid = s?.user?.id ?? null;
      if (lastUserIdRef.current !== null && lastUserIdRef.current !== newUid) {
        // User switched (or signed out) — drop all cached data from previous user
        qc.clear();
      }
      lastUserIdRef.current = newUid;
      setSession(s);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => handle(s));
    supabase.auth.getSession().then(({ data }) => {
      handle(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
