import React, { useState } from 'react';

type SignupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin?: () => void;
};

export function SignupModal({ isOpen, onClose, onSwitchToLogin }: SignupModalProps): JSX.Element | null {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!email || !password || !name) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, name })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess(true);

      // Auto-switch to login after 2 seconds
      setTimeout(() => {
        setSuccess(false);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        if (onSwitchToLogin) {
          onSwitchToLogin();
        } else {
          onClose();
        }
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Prevent closing modal when clicking outside
    // Users must explicitly click Cancel or X button
    e.stopPropagation();
  };

  if (success) {
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
      >
        <div
          className="panel"
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '3rem 2rem',
            borderRadius: '1rem',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ margin: '0 0 1rem', color: '#10b981', fontSize: '1.5rem' }}>
            Account Created!
          </h2>
          <p style={{ margin: 0, color: '#64748b' }}>
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

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
          maxWidth: '450px',
          padding: '2rem',
          borderRadius: '1rem',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '2rem',
          gap: '0.5rem'
        }}>
          <img
            src="/logo.png"
            alt="AIRGen Logo"
            style={{
              width: '32px',
              height: 'auto'
            }}
          />
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#1c2530'
          }}>
            Create Account
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            <span>Full Name</span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              disabled={isLoading}
              required
              autoComplete="name"
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isLoading}
              required
              autoComplete="email"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={isLoading}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </label>

          <label>
            <span>Confirm Password</span>
            <input
              type="password"
              name="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
          </label>

          {error && (
            <p className="form-error">{error}</p>
          )}

          <div style={{
            padding: '1rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            fontSize: '0.85rem',
            color: '#64748b'
          }}>
            <strong style={{ color: '#1c2530' }}>Password requirements:</strong>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem' }}>
              <li>At least 8 characters long</li>
              <li>Mix of letters, numbers recommended</li>
            </ul>
          </div>

          <div className="form-actions" style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="submit"
              disabled={isLoading}
              style={{ flex: 1 }}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ghost-button"
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </form>

        {onSwitchToLogin && (
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center',
            fontSize: '0.9rem',
            color: '#64748b'
          }}>
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#1f5eff',
                fontWeight: '600',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
