import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { enableMobileRedirectPreference, isMobileRedirectDisabled } from "../useMobileRedirect";

export function MobileViewToggle(): JSX.Element | null {
  const navigate = useNavigate();
  const location = useLocation();
  const [disabled, setDisabled] = useState<boolean>(() => isMobileRedirectDisabled());

  useEffect(() => {
    if (typeof window === "undefined") {return;}
    const listener = () => setDisabled(isMobileRedirectDisabled());
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  const handleOpenMobile = () => {
    enableMobileRedirectPreference();
    const params = new URLSearchParams(location.search);
    params.set("forceMobile", "1");
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  if (!disabled) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleOpenMobile}
      className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
    >
      Open mobile viewer
    </button>
  );
}
