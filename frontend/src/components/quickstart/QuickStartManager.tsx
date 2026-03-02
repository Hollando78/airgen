import { useQuickStart } from "../../contexts/QuickStartContext";
import { useQuickStartPageTracker } from "../../hooks/useQuickStartPageTracker";
import { QuickStartWelcomeModal } from "./QuickStartWelcomeModal";
import { QuickStartWidget } from "./QuickStartWidget";
import { QuickStartPageHint } from "./QuickStartPageHint";
import { QuickStartCompletionModal } from "./QuickStartCompletionModal";

export function QuickStartManager(): JSX.Element | null {
  const { state } = useQuickStart();
  useQuickStartPageTracker();

  // Nothing to render if guide is disabled and welcome has been seen
  if (!state.isEnabled && state.hasSeenWelcome) return null;

  return (
    <>
      <QuickStartWelcomeModal />
      <QuickStartWidget />
      <QuickStartCompletionModal />
    </>
  );
}
