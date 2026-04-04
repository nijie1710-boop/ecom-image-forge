import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  adminLoading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

async function checkAdminRole(userId: string | undefined) {
  if (!userId) return false;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("load admin role failed:", error);
    return false;
  }

  return Boolean(data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    const applySession = async (nextSession: Session | null) => {
      setSession(nextSession);
      setLoading(false);

      if (!nextSession?.user) {
        setIsAdmin(false);
        setAdminLoading(false);
        return;
      }

      setAdminLoading(true);
      const admin = await checkAdminRole(nextSession.user.id);
      setIsAdmin(admin);
      setAdminLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      void applySession(initialSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        adminLoading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
