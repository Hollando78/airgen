import { useEffect } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  onSwitchToSignup?: () => void;
  onForgotPassword?: () => void;
  onViewDesktop?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
};

export function MobileLoginSheet({
  isOpen,
  onClose,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onSwitchToSignup,
  onForgotPassword,
  onViewDesktop,
  isLoading,
  errorMessage
}: Props): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) {return;}
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-black/60 backdrop-blur-sm">
      <div className="mt-auto rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-lg">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-neutral-300" />
        <header className="text-center">
          <img src="/logo.png" alt="AIRGen Logo" className="mx-auto h-10 w-10" />
          <h2 className="mt-2 text-lg font-semibold text-neutral-900">Sign in to AIRGen</h2>
          <p className="mt-2 text-xs leading-5 text-neutral-500">
            Enter your credentials to continue. Editing tools remain desktop-only.
          </p>
        </header>

        <form
          onSubmit={async event => {
            event.preventDefault();
            await onSubmit();
          }}
          className="mt-5 space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Email</span>
            <input
              type="email"
              name="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              value={email}
              onChange={event => onEmailChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Password</span>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => onPasswordChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
          </label>

          {onForgotPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-sm font-medium text-primary hover:underline"
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </div>
          )}

          {errorMessage && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in…' : 'Continue'}
          </button>
        </form>

        {onViewDesktop && (
          <button
            type="button"
            onClick={onViewDesktop}
            className="mt-6 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            disabled={isLoading}
          >
            View desktop layout
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
          disabled={isLoading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
