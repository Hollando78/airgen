import "../mobile-spinner.css";

type MobileLoadingOverlayProps = {
  message?: string;
};

export function MobileLoadingOverlay({ message = "Generating…" }: MobileLoadingOverlayProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-[1500] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mobile-spinner text-primary">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="24" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-medium text-white/90">{message}</p>
      <p className="mt-1 px-6 text-center text-xs text-white/70">
        We&apos;re running AIRGen in the cloud. This may take a few seconds.
      </p>
    </div>
  );
}
