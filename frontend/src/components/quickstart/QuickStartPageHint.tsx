import { useLocation } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useQuickStart } from "../../contexts/QuickStartContext";
import { MISSIONS } from "./missions";

export function QuickStartPageHint(): JSX.Element | null {
  const { pathname } = useLocation();
  const { state, shouldShowHint, dismissHint } = useQuickStart();

  if (!state.isEnabled || !state.hasSeenWelcome) return null;

  // Find all missions targeting the current page
  const pageMissions = MISSIONS.filter((m) => m.targetRoute === pathname);
  if (pageMissions.length === 0) return null;

  // Pick the best mission to show a hint for:
  // - Prefer an incomplete mission (so the hint is actionable)
  // - Fall back to the first mission for the page (for informational value)
  const incompleteMission = pageMissions.find(
    (m) => !state.missions[m.id]?.completed
  );
  const missionToShow = incompleteMission ?? pageMissions[0];

  // Use a hint key that combines path + mission id so /dashboard can have
  // separate dismissals for "visit-dashboard" vs "run-qa-scoring"
  const hintKey = `${pathname}::${missionToShow.id}`;
  if (!shouldShowHint(hintKey)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-start gap-3 rounded-lg border-l-4 border-brand-500 bg-brand-50 dark:bg-brand-900/20 px-4 py-3"
    >
      <Sparkles
        size={16}
        className="flex-shrink-0 mt-0.5 text-brand-500"
      />
      <p className="flex-1 text-sm text-brand-800 dark:text-brand-200">
        {missionToShow.pageHintText}
      </p>
      <button
        onClick={() => dismissHint(hintKey)}
        className="flex-shrink-0 rounded p-0.5 text-brand-400 hover:text-brand-600 dark:hover:text-brand-200 hover:bg-brand-100 dark:hover:bg-brand-800/30 transition-colors"
        aria-label="Dismiss hint"
      >
        <X size={14} />
      </button>
    </div>
  );
}
