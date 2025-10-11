import React, { useState } from 'react';
import { TwoFactorSettings } from '../components/TwoFactorSettings';
import { useAuth } from '../contexts/AuthContext';

export function SettingsRoute(): JSX.Element {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('security');

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '2rem', fontSize: '2rem', fontWeight: '700' }}>
          Settings
        </h1>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '2rem',
          borderBottom: '2px solid #e2e8f0'
        }}>
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '1rem 1.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${activeTab === 'profile' ? '#1f5eff' : 'transparent'}`,
              color: activeTab === 'profile' ? '#1f5eff' : '#64748b',
              fontWeight: activeTab === 'profile' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '-2px'
            }}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            style={{
              padding: '1rem 1.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${activeTab === 'security' ? '#1f5eff' : 'transparent'}`,
              color: activeTab === 'security' ? '#1f5eff' : '#64748b',
              fontWeight: activeTab === 'security' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '-2px'
            }}
          >
            Security
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="panel" style={{ padding: '2rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Profile Information</h2>

            <div style={{
              display: 'grid',
              gap: '1.5rem',
              maxWidth: '500px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#1c2530'
                }}>
                  Name
                </label>
                <div style={{
                  padding: '0.75rem 1rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  color: '#64748b'
                }}>
                  {user?.name || 'Not set'}
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#1c2530'
                }}>
                  Email
                </label>
                <div style={{
                  padding: '0.75rem 1rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  color: '#64748b'
                }}>
                  {user?.email || 'Not set'}
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#1c2530'
                }}>
                  Roles
                </label>
                <div style={{
                  padding: '0.75rem 1rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  color: '#64748b'
                }}>
                  {user?.roles?.join(', ') || 'No roles assigned'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <TwoFactorSettings />
        )}
      </div>
    </div>
  );
}
