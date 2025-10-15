import React, { useState, useEffect } from 'react';
import { toast } from "sonner";
import { useAuth } from '../contexts/AuthContext';

type MfaStatus = {
  mfaEnabled: boolean;
  backupCodesRemaining: number;
};

type SetupResponse = {
  qrCode: string;
  secret: string;
  uri: string;
};

type VerifyResponse = {
  message: string;
  backupCodes: string[];
};

export function TwoFactorSettings(): JSX.Element {
  const { token } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Setup state
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  // Load MFA status
  useEffect(() => {
    if (!token) {return;}

    const loadStatus = async () => {
      try {
        const response = await fetch('/api/mfa/status', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load 2FA status');
        }

        const data: MfaStatus = await response.json();
        setStatus(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load 2FA status');
      } finally {
        setLoading(false);
      }
    };

    void loadStatus();
  }, [token]);

  const handleStartSetup = async () => {
    if (!token) {return;}

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/mfa/totp/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to start 2FA setup');
      }

      const data: SetupResponse = await response.json();
      setSetupData(data);
      setShowSetup(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !verificationCode) {return;}

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/mfa/totp/verify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: verificationCode })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Verification failed' }));
        throw new Error(errorData.error || 'Verification failed');
      }

      const data: VerifyResponse = await response.json();
      setBackupCodes(data.backupCodes);
      setShowBackupCodes(true);
      setShowSetup(false);
      setVerificationCode('');

      // Update status
      setStatus({ mfaEnabled: true, backupCodesRemaining: data.backupCodes.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!token) {return;}

    if (!confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/mfa/disable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to disable 2FA');
      }

      setStatus({ mfaEnabled: false, backupCodesRemaining: 0 });
      toast.success('Two-factor authentication has been disabled. You will need to log in again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    const text = backupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'airgen-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n')).then(
      () => toast.success('Backup codes copied to clipboard!'),
      () => toast.error('Failed to copy backup codes')
    );
  };

  if (loading && !status) {
    return <div>Loading 2FA settings...</div>;
  }

  if (showBackupCodes) {
    return (
      <div className="panel" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Save Your Backup Codes</h2>

        <div style={{
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f' }}>
            <strong>Important:</strong> Save these backup codes in a secure location. Each code can only be used once.
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem',
          fontFamily: 'monospace',
          fontSize: '1.1rem',
          letterSpacing: '0.1em',
          textAlign: 'center'
        }}>
          {backupCodes.map((code, index) => (
            <div key={index} style={{ padding: '0.5rem 0' }}>
              {code}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadBackupCodes} style={{ flex: 1 }}>
            Download Codes
          </button>
          <button onClick={handleCopyBackupCodes} className="ghost-button" style={{ flex: 1 }}>
            Copy to Clipboard
          </button>
          <button onClick={() => setShowBackupCodes(false)} className="ghost-button" style={{ flex: 1 }}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (showSetup && setupData) {
    return (
      <div className="panel" style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Set Up Two-Factor Authentication</h2>

        <p style={{ marginBottom: '1.5rem', color: '#64748b' }}>
          Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
        </p>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1.5rem'
        }}>
          <img
            src={setupData.qrCode}
            alt="QR Code for 2FA setup"
            style={{
              maxWidth: '250px',
              border: '2px solid #e2e8f0',
              borderRadius: '0.5rem',
              padding: '1rem',
              backgroundColor: 'white'
            }}
          />
        </div>

        <details style={{ marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          <summary style={{ cursor: 'pointer', color: '#64748b', marginBottom: '0.5rem' }}>
            Can't scan? Enter this code manually
          </summary>
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            letterSpacing: '0.1em',
            textAlign: 'center',
            userSelect: 'all'
          }}>
            {setupData.secret}
          </div>
        </details>

        <form onSubmit={handleVerifySetup} className="form-grid">
          <label>
            <span>Verification Code</span>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              required
              autoFocus
              style={{
                letterSpacing: '0.2em',
                fontSize: '1.1rem',
                textAlign: 'center',
                fontFamily: 'monospace'
              }}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions" style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Verifying...' : 'Enable 2FA'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSetup(false);
                setSetupData(null);
                setVerificationCode('');
              }}
              className="ghost-button"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="panel" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Two-Factor Authentication</h2>
      <p style={{ marginBottom: '2rem', color: '#64748b' }}>
        Add an extra layer of security to your account by requiring a code from your phone in addition to your password.
      </p>

      {error && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem',
          color: '#991b1b'
        }}>
          {error}
        </div>
      )}

      {status?.mfaEnabled ? (
        <div>
          <div style={{
            padding: '1rem',
            backgroundColor: '#d1fae5',
            border: '1px solid #10b981',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>✓</span>
            <div>
              <strong style={{ color: '#065f46' }}>Two-factor authentication is enabled</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#047857' }}>
                Your account is protected with 2FA. You have {status.backupCodesRemaining} backup code(s) remaining.
              </p>
            </div>
          </div>

          <button
            onClick={handleDisable2FA}
            disabled={loading}
            className="ghost-button"
            style={{
              color: '#dc2626',
              borderColor: '#dc2626',
              width: '100%'
            }}
          >
            {loading ? 'Disabling...' : 'Disable Two-Factor Authentication'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            padding: '1rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f' }}>
              Two-factor authentication is not enabled. Your account is less secure without it.
            </p>
          </div>

          <button
            onClick={handleStartSetup}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Setting up...' : 'Enable Two-Factor Authentication'}
          </button>
        </div>
      )}
    </div>
  );
}
