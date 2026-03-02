import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQuickStart } from "../contexts/QuickStartContext";
import { ROUTE_MISSION_MAP } from "../components/quickstart/missions";

export function useQuickStartPageTracker(): void {
  const { pathname } = useLocation();
  const { state, completeMission, isMissionCompleted } = useQuickStart();
  const prevEnabledRef = useRef(state.isEnabled);

  useEffect(() => {
    // Don't track before the user has seen the welcome modal
    if (!state.isEnabled || !state.hasSeenWelcome) return;

    const missionId = ROUTE_MISSION_MAP[pathname];
    if (missionId && !isMissionCompleted(missionId)) {
      completeMission(missionId);
    }
  }, [pathname, state.isEnabled, state.hasSeenWelcome, completeMission, isMissionCompleted]);

  // Re-check current page when guide is re-enabled (pathname didn't change)
  useEffect(() => {
    const wasDisabled = !prevEnabledRef.current;
    prevEnabledRef.current = state.isEnabled;

    if (wasDisabled && state.isEnabled && state.hasSeenWelcome) {
      const missionId = ROUTE_MISSION_MAP[pathname];
      if (missionId && !isMissionCompleted(missionId)) {
        completeMission(missionId);
      }
    }
  }, [state.isEnabled, state.hasSeenWelcome, pathname, completeMission, isMissionCompleted]);
}
