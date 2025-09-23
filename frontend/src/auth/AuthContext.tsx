import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AuthUser = {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
  tenantSlugs?: string[];
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  setToken: (token: string | null) => void;
  clearToken: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwt(token: string): AuthUser | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return {
      sub: json.sub,
      email: json.email,
      name: json.name,
      roles: Array.isArray(json.roles) ? json.roles : undefined,
      tenantSlugs: Array.isArray(json.tenantSlugs) ? json.tenantSlugs : undefined
    };
  } catch (error) {
    return null;
  }
}

const STORAGE_KEY = "airgen.authToken";

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  const setToken = useCallback((value: string | null) => {
    setTokenState(value);
    if (typeof window === "undefined") return;
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const clearToken = useCallback(() => setToken(null), [setToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setTokenState(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const user = useMemo(() => {
    if (!token) return null;
    return decodeJwt(token);
  }, [token]);

  const value = useMemo<AuthContextValue>(() => ({ token, user, setToken, clearToken }), [token, user, setToken, clearToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
