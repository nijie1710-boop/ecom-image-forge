import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  isSelfHosted,
  selfHostedGetMe,
  selfHostedSignOut,
} from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface SelfHostedUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  is_admin: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  adminLoading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ADMIN_EMAIL_ALLOWLIST = ["nijie1710@gmail.com"];

/** Map a SelfHostedUser to a Supabase-compatible User shape. */
function toSupabaseUser(u: SelfHostedUser): User {
  return {
    id: u.id,
    email: u.email,
    app_metadata: {},
    user_metadata: { display_name: u.display_name },
    aud: "authenticated",
    created_at: u.created_at,
  } as unknown as User;
}

/** Check admin status – works for both modes. */
async function checkAdminRole(
  user: User | null | undefined,
  selfHostedAdmin?: boolean,
): Promise<boolean> {
  if (!user?.id) return false;

  // Self-hosted: trust the is_admin flag first
  if (selfHostedAdmin !== undefined) {
    if (selfHostedAdmin) return true;
  }

  // Email allowlist (both modes)
  const email = user.email?.toLowerCase();
  if (email && ADMIN_EMAIL_ALLOWLIST.includes(email)) {
    return true;
  }

  // Supabase mode: query the database
  if (!isSelfHosted) {
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

  return false;
}

// ---------------------------------------------------------------------------
// Supabase-only helper
// ---------------------------------------------------------------------------

async function resolveActiveUser(): Promise<User | null> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      // 服务端确认 session 无效，清除本地缓存避免下次仍短暂显示已登录
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return null;
    }

    return user;
  } catch {
    // 网络异常（如 Supabase 不可用），不主动清除缓存
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  // ---- Self-hosted helpers ------------------------------------------------

  const applySelfHostedUser = useCallback(
    async (selfHostedUser: SelfHostedUser | null) => {
      if (!selfHostedUser) {
        setUser(null);
        setSession(null);
        setIsAdmin(false);
        setAdminLoading(false);
        setLoading(false);
        return;
      }

      const mapped = toSupabaseUser(selfHostedUser);
      setUser(mapped);
      setSession(null); // session not used in self-hosted mode
      setLoading(false);

      setAdminLoading(true);
      const admin = await checkAdminRole(mapped, selfHostedUser.is_admin);
      setIsAdmin(admin);
      setAdminLoading(false);
    },
    [],
  );

  const fetchSelfHostedUser = useCallback(async () => {
    const me = (await selfHostedGetMe()) as SelfHostedUser | null;
    await applySelfHostedUser(me);
  }, [applySelfHostedUser]);

  // ---- Supabase helpers ---------------------------------------------------

  const applySession = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setSession(null);
      setUser(null);
      setLoading(false);
      setIsAdmin(false);
      setAdminLoading(false);
      return;
    }

    const activeUser = await resolveActiveUser();
    if (!activeUser) {
      setSession(null);
      setUser(null);
      setLoading(false);
      setIsAdmin(false);
      setAdminLoading(false);
      return;
    }

    setSession({ ...nextSession, user: activeUser });
    setUser(activeUser);
    setLoading(false);

    setAdminLoading(true);
    const admin = await checkAdminRole(activeUser);
    setIsAdmin(admin);
    setAdminLoading(false);
  }, []);

  // ---- Mount effect -------------------------------------------------------

  useEffect(() => {
    if (isSelfHosted) {
      // Self-hosted: fetch user via API and listen for cross-tab token changes
      void fetchSelfHostedUser();

      const onStorage = (e: StorageEvent) => {
        if (e.key === "picspark_token") {
          void fetchSelfHostedUser();
        }
      };

      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    // Supabase mode: use onAuthStateChange + getSession
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      void applySession(initialSession);
    });

    return () => subscription.unsubscribe();
  }, [applySession, fetchSelfHostedUser]);

  // ---- signOut ------------------------------------------------------------

  const signOut = useCallback(async () => {
    if (isSelfHosted) {
      selfHostedSignOut();
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      setAdminLoading(false);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      throw error;
    }
    setSession(null);
    setUser(null);
    setLoading(false);
    setIsAdmin(false);
    setAdminLoading(false);
  }, []);

  // ---- refreshUser --------------------------------------------------------

  const refreshUser = useCallback(async () => {
    if (isSelfHosted) {
      await fetchSelfHostedUser();
      return;
    }

    // Supabase: re-fetch the current session
    const {
      data: { session: latest },
    } = await supabase.auth.getSession();
    await applySession(latest);
  }, [applySession, fetchSelfHostedUser]);

  // ---- Render -------------------------------------------------------------

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isAdmin,
        adminLoading,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
