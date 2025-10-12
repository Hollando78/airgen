import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const STORAGE_KEY = "airgen.mobile.forceDesktop";
const MOBILE_BREAKPOINT = 768;

function prefersMobileLayout(): boolean {
  if (typeof window === "undefined") {return false;}

  const matchMedia = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobileUa = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  return Boolean(matchMedia?.matches || isMobileUa);
}

export function useMobileRedirect(enabled: boolean): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {return;}

    const params = new URLSearchParams(location.search);
    const forceDesktopParam = params.get("forceDesktop");
    const forceMobileParam = params.get("forceMobile");

    if (forceDesktopParam === "1") {
      window.localStorage.setItem(STORAGE_KEY, "true");
      params.delete("forceDesktop");
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" }, { replace: true });
      return;
    }

    if (forceMobileParam === "1") {
      window.localStorage.removeItem(STORAGE_KEY);
      params.delete("forceMobile");
      navigate({ pathname: "/mobile", search: params.toString() ? `?${params}` : "" }, { replace: true });
      return;
    }

    const forcedDesktop = window.localStorage.getItem(STORAGE_KEY) === "true";
    const onMobileRoute = location.pathname.startsWith("/mobile");

    if (forcedDesktop) {
      return;
    }

    const mobile = prefersMobileLayout();
    if (mobile && !onMobileRoute) {
      navigate("/mobile", { replace: true, state: { redirected: true, from: location.pathname } });
    }
  }, [enabled, location.pathname, location.search, navigate]);
}

export function disableMobileRedirectPreference(): void {
  if (typeof window === "undefined") {return;}
  window.localStorage.setItem(STORAGE_KEY, "true");
}

export function enableMobileRedirectPreference(): void {
  if (typeof window === "undefined") {return;}
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isMobileRedirectDisabled(): boolean {
  if (typeof window === "undefined") {return false;}
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}
