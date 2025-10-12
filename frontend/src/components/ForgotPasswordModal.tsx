import React, { useState, useEffect } from 'react';

type ForgotPasswordModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onBackToLogin?: () => void;
};

export function ForgotPasswordModal({
  isOpen,
  onClose,
  onBackToLogin
}: ForgotPasswordModalProps): JSX.Element | null {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setIsSubmitting(false);
      setError(null);
      setIsSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: email.trim() })
      });

      if (!response.ok) {
        const info = await response.json().catch(() => null);
        throw new Error(info?.error || 'Unable to send reset instructions');
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset instructions');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '2rem',
          borderRadius: '1rem'
        }}
      >
        <h2
          style={{
            marginTop: 0,
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#1c2530'
          }}
        >
          Forgot your password?
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#475569' }}>
          Enter the email associated with your account and we&apos;ll send instructions to reset your password.
        </p>

        {error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fee2e2',
              color: '#b91c1c'
            }}
          >
            {error}
          </div>
        )}

        {isSuccess ? (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              borderRadius: '0.75rem',
              backgroundColor: '#dcfce7',
              color: '#166534'
            }}
          >
            If an account exists for <strong>{email}</strong>, you&apos;ll receive an email with reset instructions shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid" style={{ gap: '1rem' }}>
            <label>
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                disabled={isSubmitting}
                required
                autoComplete="email"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ marginTop: '0.5rem' }}
            >
              {isSubmitting ? 'Sending instructions...' : 'Send reset link'}
            </button>
          </form>
        )}

        <div
          style={{
            marginTop: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Close
          </button>

          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: '#1f5eff',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
            onClick={onBackToLogin}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
