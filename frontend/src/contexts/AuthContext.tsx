import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type User = {
  id: string;
  email: string;
  name?: string;
  roles: string[];
  tenantSlugs: string[];
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
};

const STORAGE_TOKEN = "auth_token";
const STORAGE_USER = "auth_user";
const STORAGE_EXPIRY = "auth_token_expires_at";

const AuthContext = createContext<AuthContextType | null>(null);

function decodeJwtExpiration(token: string): number | null {
  try {
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) {
      return null;
    }
    let normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4;
    if (padding > 0) {
      normalized = normalized.padEnd(normalized.length + (4 - padding), "=");
    }
    const payloadJson = atob(normalized);
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (typeof payload.exp !== "number") {
      return null;
    }
    return payload.exp * 1000;
  } catch (error) {
    return null;
  }
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

type LoginResponse = {
  token: string;
  user: User;
};

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearStoredAuth = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    localStorage.removeItem(STORAGE_EXPIRY);
  }, []);

  // Bootstrap auth state from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_TOKEN);
    const savedUser = localStorage.getItem(STORAGE_USER);
    const savedExpiry = localStorage.getItem(STORAGE_EXPIRY);

    if (!savedToken || !savedUser) {
      setIsLoading(false);
      return;
    }

    try {
      const parsedUser = JSON.parse(savedUser) as User;
      const expiry = savedExpiry ? Number(savedExpiry) : decodeJwtExpiration(savedToken);

      if (!expiry || Number.isNaN(expiry) || expiry <= Date.now()) {
        clearStoredAuth();
        setIsLoading(false);
        return;
      }

      setToken(savedToken);
      setUser(parsedUser);
      setTokenExpiresAt(expiry);
    } catch (error) {
      clearStoredAuth();
      setIsLoading(false);
    }
  }, [clearStoredAuth]);

  // Verify the token with the backend whenever it changes
  useEffect(() => {
    let cancelled = false;

    async function verifyToken(currentToken: string | null) {
      if (!currentToken) {
        if (!cancelled) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${currentToken}`
          }
        });

        if (!response.ok) {
          throw new Error("Session validation failed");
        }

        const data = (await response.json()) as { user: User };
        if (!cancelled) {
          setUser(data.user);
          setError(null);

          if (!tokenExpiresAt) {
            const expiry = decodeJwtExpiration(currentToken);
            if (expiry) {
              setTokenExpiresAt(expiry);
              localStorage.setItem(STORAGE_EXPIRY, expiry.toString());
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          clearStoredAuth();
          setToken(null);
          setUser(null);
          setTokenExpiresAt(null);
          setError("Session expired. Please log in again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void verifyToken(token);

    return () => {
      cancelled = true;
    };
  }, [token, tokenExpiresAt, clearStoredAuth]);

  // Auto-logout when the token expiration is reached
  useEffect(() => {
    if (!token || !tokenExpiresAt) {
      return;
    }

    const remaining = tokenExpiresAt - Date.now();
    if (remaining <= 0) {
      clearStoredAuth();
      setToken(null);
      setUser(null);
      setTokenExpiresAt(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearStoredAuth();
      setToken(null);
      setUser(null);
      setTokenExpiresAt(null);
    }, remaining);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token, tokenExpiresAt, clearStoredAuth]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Login failed" }));
        throw new Error(errorData.error || "Login failed");
      }

      const data: LoginResponse = await response.json();
      const expiry = decodeJwtExpiration(data.token);

      localStorage.setItem(STORAGE_TOKEN, data.token);
      localStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      if (expiry) {
        localStorage.setItem(STORAGE_EXPIRY, expiry.toString());
      } else {
        localStorage.removeItem(STORAGE_EXPIRY);
      }

      setToken(data.token);
      setUser(data.user);
      setTokenExpiresAt(expiry ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
    setTokenExpiresAt(null);
    setError(null);
    setIsLoading(false);
  }, [clearStoredAuth]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    token,
    login,
    logout,
    isLoading,
    error
  }), [user, token, login, logout, isLoading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
