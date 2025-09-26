import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LoginModal({ isOpen, onClose }: LoginModalProps): JSX.Element | null {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!email || !password) {
      setLoginError('Please enter both email and password');
      return;
    }

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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={isLoading}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              required
            />
          </label>

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
      </div>
    </div>
  );
}