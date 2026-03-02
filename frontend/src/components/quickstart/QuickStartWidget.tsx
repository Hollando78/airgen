import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, ChevronUp, X, Check } from "lucide-react";
import { useQuickStart } from "../../contexts/QuickStartContext";
import { MISSIONS } from "./missions";
import { QuickStartProgressRing } from "./QuickStartProgressRing";

export function QuickStartWidget(): JSX.Element | null {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    state,
    toggleWidget,
    disableGuide,
    completedCount,
    totalMissions,
    progressPercent,
    isMissionCompleted,
  } = useQuickStart();

  if (!state.isEnabled || !state.hasSeenWelcome) return null;

  const handleMissionClick = (targetRoute: string) => {
    if (pathname !== targetRoute) {
      navigate(targetRoute);
    }
  };

  if (!state.isWidgetExpanded) {
    return (
      <div
        role="complementary"
        aria-label="Quick Start Guide"
        style={{ zIndex: 1250 }}
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 shadow-lg cursor-pointer select-none transition-all duration-200 hover:shadow-xl"
        onClick={toggleWidget}
        onKeyDown={(e) => e.key === "Enter" && toggleWidget()}
        tabIndex={0}
      >
        <QuickStartProgressRing size={24} percent={progressPercent} strokeWidth={2.5} />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Quick Start
        </span>
        <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
          {completedCount}/{totalMissions}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            disableGuide();
          }}
          className="ml-1 rounded-full p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Dismiss Quick Start Guide"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="complementary"
      aria-label="Quick Start Guide"
      style={{ zIndex: 1250 }}
      className="fixed bottom-6 right-6 w-80 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Quick Start Guide
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleWidget}
            className="rounded p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Collapse widget"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={disableGuide}
            className="rounded p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Dismiss Quick Start Guide"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex flex-col items-center gap-2 py-4 border-b border-neutral-100 dark:border-neutral-800">
        <QuickStartProgressRing size={64} percent={progressPercent} strokeWidth={4} showLabel />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {completedCount} of {totalMissions} missions completed
        </p>
      </div>

      {/* Mission List */}
      <div className="max-h-64 overflow-y-auto">
        {MISSIONS.map((mission) => {
          const completed = isMissionCompleted(mission.id);
          const Icon = mission.icon;
          const isCurrentPage = pathname === mission.targetRoute;

          return (
            <button
              key={mission.id}
              type="button"
              onClick={() => !completed && handleMissionClick(mission.targetRoute)}
              disabled={completed}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                completed
                  ? "opacity-60 cursor-default"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer"
              } ${isCurrentPage && !completed ? "bg-brand-50/50 dark:bg-brand-900/10" : ""}`}
            >
              <div
                className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${
                  completed
                    ? "bg-green-500 border-green-500"
                    : "border-neutral-300 dark:border-neutral-600"
                }`}
              >
                {completed && <Check size={12} className="text-white" />}
              </div>
              <Icon
                size={16}
                className={
                  completed
                    ? "text-neutral-400 dark:text-neutral-500"
                    : "text-neutral-600 dark:text-neutral-400"
                }
              />
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${
                    completed
                      ? "line-through text-neutral-400 dark:text-neutral-500"
                      : "text-neutral-700 dark:text-neutral-200"
                  }`}
                >
                  {mission.title}
                </span>
              </div>
              {!completed && (
                <ChevronUp size={14} className="text-neutral-300 dark:text-neutral-600 rotate-90" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800">
        <button
          onClick={disableGuide}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          Dismiss Guide
        </button>
      </div>
    </div>
  );
}
