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

const ADMIN_EMAIL_ALLOWLIST = ["nijie1710@gmail.com"];

async function checkAdminRole(user: User | null | undefined) {
  if (!user?.id) return false;

  // 邮箱优先匹配
  const email = user.email?.toLowerCase();
  if (email && ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    return true;
  }

  // 再查数据库
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("load admin role failed:", error);
    return false;
  }

  return Boolean(data);
}

async function resolveActiveUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    const applySession = async (nextSession: Session | null) => {
      if (!nextSession?.user) {
        setSession(null);
        setLoading(false);
        setIsAdmin(false);
        setAdminLoading(false);
        return;
      }

      const activeUser = await resolveActiveUser();
      if (!activeUser) {
        setSession(null);
        setLoading(false);
        setIsAdmin(false);
        setAdminLoading(false);
        return;
      }

      setSession({ ...nextSession, user: activeUser });
      setLoading(false);
      setAdminLoading(true);
      const admin = await checkAdminRole(activeUser);
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
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      throw error;
    }
    setSession(null);
    setLoading(false);
    setIsAdmin(false);
    setAdminLoading(false);
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
