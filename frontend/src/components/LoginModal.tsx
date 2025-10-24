import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MfaVerificationModal } from './MfaVerificationModal';
import { MobileLoginSheet } from '../mobile/components/MobileLoginSheet';
import { disableMobileRedirectPreference } from '../mobile/useMobileRedirect';

export type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup?: () => void;
  onForgotPassword?: () => void;
};

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') {return false;}
  return window.matchMedia?.('(max-width: 768px)')?.matches ?? false;
}

export function LoginModal({ isOpen, onClose, onSwitchToSignup, onForgotPassword }: LoginModalProps): JSX.Element | null {
  const { login, isLoading, error, mfaRequired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileViewport());

  useEffect(() => {
    if (typeof window === 'undefined') {return;}
    const listener = () => setIsMobile(isMobileViewport());
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, []);

  // Show MFA modal when MFA is required
  useEffect(() => {
    if (mfaRequired) {
      setShowMfaModal(true);
    }
  }, [mfaRequired]);

  if (!isOpen) {return null;}

  const submitLogin = async () => {
    if (!email || !password) {
      setLoginError('Please enter both email and password');
      return;
    }

    setLoginError(null);

    try {
      await login(email, password);
      onClose();
      // Reset form
      setEmail('');
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitLogin();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Prevent closing modal when clicking outside
    // Users must explicitly click Cancel or X button
    e.stopPropagation();
  };

  const handleMfaSuccess = () => {
    // Reset form
    setEmail('');
    setPassword('');
    setShowMfaModal(false);
    onClose();
  };

  const handleMfaClose = () => {
    setShowMfaModal(false);
    setLoginError('MFA verification cancelled. Please log in again.');
  };

  if (isMobile) {
    return (
      <MobileLoginSheet
        isOpen={isOpen}
        onClose={onClose}
        onSwitchToSignup={onSwitchToSignup}
        onForgotPassword={onForgotPassword}
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={submitLogin}
        isLoading={isLoading}
        errorMessage={loginError || error || null}
        onViewDesktop={() => {
          disableMobileRedirectPreference();
          onClose();
        }}
      />
    );
  }

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <MfaVerificationModal
        isOpen={showMfaModal}
        onClose={handleMfaClose}
        onSuccess={handleMfaSuccess}
      />
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
          maxWidth: '400px',
          padding: '2rem',
          borderRadius: '1rem'
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
            Sign In
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
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
              placeholder="Enter your password"
              disabled={isLoading}
              required
              autoComplete="current-password"
            />
          </label>

          {onForgotPassword && (
            <div style={{ marginTop: '-0.5rem', marginBottom: '0.5rem', textAlign: 'right' }}>
              <button
                type="button"
                onClick={onForgotPassword}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1f5eff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  fontSize: '0.875rem'
                }}
                disabled={isLoading}
              >
                Forgot password?
              </button>
            </div>
          )}

          {(loginError || error) && (
            <p className="form-error">{loginError || error}</p>
          )}

          <div className="form-actions" style={{ display: 'flex', gap: '1rem' }}>
            <button 
              type="submit" 
              disabled={isLoading}
              style={{ flex: 1 }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
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

        {onSwitchToSignup && (
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center',
            fontSize: '0.9rem',
            color: '#64748b'
          }}>
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onSwitchToSignup}
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
              Create account
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
