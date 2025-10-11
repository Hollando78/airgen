import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type MfaVerificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function MfaVerificationModal({ isOpen, onClose, onSuccess }: MfaVerificationModalProps): JSX.Element | null {
  const { verifyMfa, isLoading, error } = useAuth();
  const [code, setCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);

    if (!code) {
      setMfaError('Please enter your authentication code');
      return;
    }

    try {
      await verifyMfa(code);
      setCode('');
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
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
          maxWidth: '400px',
          padding: '2rem',
          borderRadius: '1rem'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.5rem',
          gap: '0.5rem'
        }}>
          <div style={{
            fontSize: '2rem',
            marginRight: '0.5rem'
          }}>
            🔐
          </div>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#1c2530'
          }}>
            Two-Factor Authentication
          </h2>
        </div>

        <p style={{
          marginBottom: '1.5rem',
          color: '#64748b',
          textAlign: 'center',
          fontSize: '0.875rem'
        }}>
          Enter the 6-digit code from your authenticator app or use one of your backup codes.
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            <span>Authentication Code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="000000 or XXXXXXXX"
              disabled={isLoading}
              required
              autoComplete="one-time-code"
              maxLength={8}
              style={{
                letterSpacing: '0.2em',
                fontSize: '1.1rem',
                textAlign: 'center',
                fontFamily: 'monospace'
              }}
              autoFocus
            />
          </label>

          {(mfaError || error) && (
            <p className="form-error">{mfaError || error}</p>
          )}

          <div className="form-actions" style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="submit"
              disabled={isLoading}
              style={{ flex: 1 }}
            >
              {isLoading ? 'Verifying...' : 'Verify'}
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

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e2e8f0',
          fontSize: '0.75rem',
          color: '#94a3b8',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0 }}>
            Lost access to your authenticator? Use a backup code instead.
          </p>
        </div>
      </div>
    </div>
  );
}
