import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AppRole, Me } from "@/lib/types";

interface AuthState {
  me: Me | null;
  isLoading: boolean;
  error: unknown;
  hasRole: (...roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const me = data ?? null;
  const hasRole = (...roles: AppRole[]) => !!me && roles.some((r) => me.roles.includes(r));

  return <AuthContext.Provider value={{ me, isLoading, error, hasRole }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Static Web Apps built-in auth endpoints. */
export const authLinks = {
  login: "/.auth/login/aad?post_login_redirect_uri=/",
  logout: "/.auth/logout?post_logout_redirect_uri=/",
};
