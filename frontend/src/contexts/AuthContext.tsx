import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserPermissions } from "../lib/rbac";

export type User = {
  id: string;
  email: string;
  name?: string;

  // NEW: Structured permissions (preferred)
  permissions?: UserPermissions;

  // DEPRECATED: Legacy fields (kept for backward compatibility)
  /** @deprecated Use permissions instead */
  roles?: string[];
  /** @deprecated Use permissions.tenantPermissions instead */
  tenantSlugs?: string[];
  /** @deprecated Use permissions.tenantPermissions[].isOwner instead */
  ownedTenantSlugs?: string[];
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  // MFA support
  mfaRequired: boolean;
  mfaTempToken: string | null;
  verifyMfa: (code: string) => Promise<void>;
  setSession: (token: string, user: User) => void;
  refreshAccessToken: () => Promise<void>;
};

const STORAGE_TOKEN = "auth_token";
const STORAGE_USER = "auth_user";
const STORAGE_EXPIRY = "auth_token_expires_at";

function normalizeUserPayload(raw: any): User {
  return {
    id: raw?.id ?? "",
    email: raw?.email ?? "",
    name: raw?.name,
    permissions: raw?.permissions,
    roles: Array.isArray(raw?.roles) ? raw.roles : [],
    tenantSlugs: Array.isArray(raw?.tenantSlugs) ? raw.tenantSlugs : [],
    ownedTenantSlugs: Array.isArray(raw?.ownedTenantSlugs) ? raw.ownedTenantSlugs : []
  };
}

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

type LoginResponse =
  | {
      token: string;
      user: User;
    }
  | {
      status: "MFA_REQUIRED";
      tempToken: string;
      message: string;
    };

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaTempToken, setMfaTempToken] = useState<string | null>(null);

  const setSession = useCallback((newToken: string, rawUser: User) => {
    const normalized = normalizeUserPayload(rawUser);
    const expiry = decodeJwtExpiration(newToken);

    localStorage.setItem(STORAGE_TOKEN, newToken);
    localStorage.setItem(STORAGE_USER, JSON.stringify(normalized));
    if (expiry) {
      localStorage.setItem(STORAGE_EXPIRY, expiry.toString());
    } else {
      localStorage.removeItem(STORAGE_EXPIRY);
    }

    setToken(newToken);
    setUser(normalized);
    setTokenExpiresAt(expiry ?? null);
    setError(null);
  }, []);

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
      const parsedUser = normalizeUserPayload(JSON.parse(savedUser));
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
          const normalized = normalizeUserPayload(data.user);
          setUser(normalized);
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

  // Refresh token automatically 2 minutes before expiry
  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include" // Send httpOnly cookie
      });

      if (!response.ok) {
        throw new Error("Token refresh failed");
      }

      const data: { token: string } = await response.json();
      const expiry = decodeJwtExpiration(data.token);

      if (!expiry) {
        throw new Error("Invalid token expiry");
      }

      // Update stored token and expiry
      localStorage.setItem(STORAGE_TOKEN, data.token);
      localStorage.setItem(STORAGE_EXPIRY, expiry.toString());

      setToken(data.token);
      setTokenExpiresAt(expiry);

      // Verify the new token to update user data
      const meResponse = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${data.token}`
        }
      });

      if (meResponse.ok) {
        const meData = (await meResponse.json()) as { user: User };
        const normalized = normalizeUserPayload(meData.user);
        setUser(normalized);
        localStorage.setItem(STORAGE_USER, JSON.stringify(normalized));
      }
    } catch (error) {
      // If refresh fails, log out the user
      clearStoredAuth();
      setToken(null);
      setUser(null);
      setTokenExpiresAt(null);
      setError("Session expired. Please log in again.");
    }
  }, [clearStoredAuth]);

  // Auto-refresh token 2 minutes before expiry (or logout if already expired)
  useEffect(() => {
    if (!token || !tokenExpiresAt) {
      return;
    }

    const remaining = tokenExpiresAt - Date.now();
    const refreshBuffer = 2 * 60 * 1000; // 2 minutes in milliseconds

    // If token already expired, logout immediately
    if (remaining <= 0) {
      clearStoredAuth();
      setToken(null);
      setUser(null);
      setTokenExpiresAt(null);
      setError("Session expired. Please log in again.");
      return;
    }

    // Schedule refresh 2 minutes before expiry (or immediately if less than 2 min remaining)
    const refreshIn = Math.max(0, remaining - refreshBuffer);

    const timeoutId = window.setTimeout(() => {
      void refreshAccessToken();
    }, refreshIn);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [token, tokenExpiresAt, clearStoredAuth, refreshAccessToken]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    setMfaRequired(false);
    setMfaTempToken(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include", // Enable cookies for refresh tokens
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Login failed" }));
        throw new Error(errorData.error || "Login failed");
      }

      const data: LoginResponse = await response.json();

      // Check if MFA is required
      if ("status" in data && data.status === "MFA_REQUIRED") {
        setMfaRequired(true);
        setMfaTempToken(data.tempToken);
        setIsLoading(false);
        return;
      }

      // Normal login flow (no MFA or MFA already verified)
      // TypeScript narrowing: if we got here, data has token and user
      if (!("token" in data) || !("user" in data)) {
        throw new Error("Invalid login response");
      }

      setSession(data.token, data.user);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setSession]);

  const verifyMfa = useCallback(async (code: string) => {
    if (!mfaTempToken) {
      throw new Error("No MFA session found. Please log in again.");
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/mfa-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include", // Enable cookies for refresh tokens
        body: JSON.stringify({ tempToken: mfaTempToken, code })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "MFA verification failed" }));
        throw new Error(errorData.error || "MFA verification failed");
      }

      const data: { token: string; user: User } = await response.json();
      setSession(data.token, data.user);
      setMfaRequired(false);
      setMfaTempToken(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "MFA verification failed";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [mfaTempToken, setSession]);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
    setTokenExpiresAt(null);
    setError(null);
    setIsLoading(false);
    setMfaRequired(false);
    setMfaTempToken(null);
  }, [clearStoredAuth]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    token,
    login,
    logout,
    isLoading,
    error,
    mfaRequired,
    mfaTempToken,
    verifyMfa,
    setSession,
    refreshAccessToken
  }), [user, token, login, logout, isLoading, error, mfaRequired, mfaTempToken, verifyMfa, setSession, refreshAccessToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
