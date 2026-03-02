import { Trophy } from "lucide-react";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
import { useQuickStart } from "../../contexts/QuickStartContext";

const CONFETTI_COLORS = [
  "bg-brand-400",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-purple-400",
  "bg-rose-400",
  "bg-cyan-400",
];

export function QuickStartCompletionModal(): JSX.Element | null {
  const { state, isAllComplete, dismissCompletion, disableGuide } = useQuickStart();

  if (!isAllComplete || state.hasSeenCompletion) return null;

  const handleClose = () => {
    dismissCompletion();
    disableGuide();
  };

  return (
    <Modal
      isOpen={isAllComplete && !state.hasSeenCompletion}
      onClose={handleClose}
      title="Mission Complete!"
      size="md"
      footer={
        <Button onClick={handleClose}>
          Close
        </Button>
      }
    >
      <div className="relative flex flex-col items-center text-center py-2">
        {/* Decorative animated dots */}
        {CONFETTI_COLORS.map((color, i) => (
          <div
            key={color}
            className={`absolute w-2 h-2 rounded-full ${color} opacity-0 animate-ping`}
            style={{
              top: `${15 + Math.sin(i * 1.05) * 35}%`,
              left: `${10 + (i * 15)}%`,
              animationDelay: `${i * 0.15}s`,
              animationDuration: "1.5s",
            }}
          />
        ))}

        <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Trophy size={32} className="text-amber-500" />
        </div>

        <p className="text-neutral-600 dark:text-neutral-400 text-sm max-w-xs">
          You've explored all the core capabilities of AIRGen Studio.
          You're ready to build great requirements.
        </p>

        <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
          You can re-enable the Quick Start Guide anytime from the user menu.
        </p>
      </div>
    </Modal>
  );
}
