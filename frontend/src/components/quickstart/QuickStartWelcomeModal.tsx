import { ListChecks, FileText, Box, Sparkles } from "lucide-react";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
import { useQuickStart } from "../../contexts/QuickStartContext";

const CAPABILITIES = [
  { icon: ListChecks, label: "Requirements", color: "text-blue-600 dark:text-blue-400" },
  { icon: FileText, label: "Documents", color: "text-emerald-600 dark:text-emerald-400" },
  { icon: Box, label: "Architecture", color: "text-purple-600 dark:text-purple-400" },
  { icon: Sparkles, label: "AI Assistant", color: "text-amber-600 dark:text-amber-400" },
];

export function QuickStartWelcomeModal(): JSX.Element | null {
  const { state, dismissWelcome, disableGuide, totalMissions } = useQuickStart();

  if (state.hasSeenWelcome) return null;

  const handleStart = () => {
    dismissWelcome();
  };

  const handleSkip = () => {
    dismissWelcome();
    disableGuide();
  };

  return (
    <Modal
      isOpen={!state.hasSeenWelcome}
      onClose={handleSkip}
      title="Welcome to AIRGen Studio"
      subtitle="AI-assisted requirements engineering for teams building safety-critical systems."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleSkip}>
            Skip for Now
          </Button>
          <Button onClick={handleStart}>
            Start Exploring
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          AIRGen helps you draft, score, trace, and manage engineering
          requirements with AI assistance and deterministic quality analysis.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {CAPABILITIES.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3"
            >
              <Icon size={20} className={color} />
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-md bg-brand-50 dark:bg-brand-900/20 px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-brand-500" />
          <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
            {totalMissions} missions to explore
          </span>
        </div>
      </div>
    </Modal>
  );
}
