import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type TenantProjectState = {
  tenant: string | null;
  project: string | null;
};

export type TenantProjectContextValue = {
  state: TenantProjectState;
  setTenant: (tenant: string | null) => void;
  setProject: (project: string | null) => void;
  reset: () => void;
};

const STORAGE_KEY = "airgen.selection";

function readInitialState(): TenantProjectState {
  if (typeof window === "undefined") {
    return { tenant: null, project: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tenant: null, project: null };
    const parsed = JSON.parse(raw) as TenantProjectState;
    return {
      tenant: parsed.tenant ?? null,
      project: parsed.project ?? null
    };
  } catch (error) {
    return { tenant: null, project: null };
  }
}

const TenantProjectContext = createContext<TenantProjectContextValue | undefined>(undefined);

export function TenantProjectProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<TenantProjectState>(() => readInitialState());

  const setTenant = useCallback((tenant: string | null) => {
    setState(prev => {
      const next = { tenant, project: tenant ? prev.project : null };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const setProject = useCallback((project: string | null) => {
    setState(prev => {
      const next = { ...prev, project };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setState({ tenant: null, project: null });
  }, []);

  const value = useMemo(
    () => ({
      state,
      setTenant,
      setProject,
      reset
    }),
    [state, setTenant, setProject, reset]
  );

  return <TenantProjectContext.Provider value={value}>{children}</TenantProjectContext.Provider>;
}

export function useTenantProject(): TenantProjectContextValue {
  const ctx = useContext(TenantProjectContext);
  if (!ctx) {
    throw new Error("useTenantProject must be used within TenantProjectProvider");
  }
  return ctx;
}
