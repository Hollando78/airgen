import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function UserMenu(): JSX.Element {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) {return <></>;}

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '0.5rem',
          color: 'white',
          cursor: 'pointer',
          fontSize: '0.9rem'
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#1f5eff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '0.85rem',
            fontWeight: '600'
          }}
        >
          {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
        </div>
        <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.name || user.email.split('@')[0]}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.tenantSlugs.join(', ') || 'No tenant'}
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
          ▼
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.25rem',
            background: 'white',
            border: '1px solid #d0d7df',
            borderRadius: '0.5rem',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
            minWidth: '200px',
            zIndex: 1000
          }}
        >
          <div style={{ padding: '0.75rem', borderBottom: '1px solid #f1f4f8' }}>
            <div style={{ fontWeight: '600', color: '#1c2530', marginBottom: '0.25rem' }}>
              {user.name || 'User'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#5d6b7a', marginBottom: '0.5rem' }}>
              {user.email}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#5d6b7a' }}>
              Roles: {user.roles.join(', ')}
            </div>
          </div>
          <div style={{ padding: '0.5rem' }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                background: 'none',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#dc2626',
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.background = '#fee2e2';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = 'none';
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}