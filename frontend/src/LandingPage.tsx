import React, { useState } from 'react';
import './styles.css';
import { LoginModal } from './components/LoginModal';

export function LandingPage(): JSX.Element {
  const [showLogin, setShowLogin] = useState(false);
  
  return (
    <>
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f7fb',
      fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div className="panel" style={{
        maxWidth: '720px',
        width: '100%',
        padding: '3rem 2.5rem',
        borderRadius: '1rem',
        boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <img 
            src="/logo.png" 
            alt="AIRGen Logo" 
            style={{
              width: '64px',
              height: 'auto'
            }}
          />
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.5rem'
          }}>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: '700',
              color: '#1c2530',
              margin: 0
            }}>
              AIRGen
            </h1>
            <span style={{
              fontSize: '1.25rem',
              color: '#5d6b7a',
              fontWeight: '400'
            }}>
              Studio
            </span>
          </div>
        </div>

        <div style={{
          marginBottom: '3rem'
        }}>
          <h2 style={{
            fontSize: '2.25rem',
            color: '#1f5eff',
            fontWeight: '600',
            marginBottom: '0.5rem'
          }}>
            Coming Soon
          </h2>
          <p style={{
            fontSize: '1.1rem',
            color: '#5d6b7a',
            lineHeight: '1.6',
            margin: '0 auto 2rem',
            maxWidth: '500px'
          }}>
            Advanced AI-powered Requirements Generation and Architecture Management Platform
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem',
          marginBottom: '3rem'
        }}>
          {[
            { name: 'Requirements', icon: '📋' },
            { name: 'Architecture', icon: '🏗️' },
            { name: 'Interfaces', icon: '🔌' },
            { name: 'Traceability', icon: '🔗' }
          ].map((feature) => (
            <div
              key={feature.name}
              className="stat-card"
              style={{
                padding: '1.25rem 1rem',
                textAlign: 'center',
                borderRadius: '0.75rem',
                background: 'rgba(31, 94, 255, 0.08)',
                border: '1px solid rgba(31, 94, 255, 0.12)'
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                {feature.icon}
              </div>
              <div style={{
                color: '#1c2530',
                fontWeight: '600',
                fontSize: '0.95rem'
              }}>
                {feature.name}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          borderTop: '1px solid #d0d7df',
          paddingTop: '2rem'
        }}>
          <p style={{
            color: '#5d6b7a',
            fontSize: '0.9rem',
            marginBottom: '1rem'
          }}>
            Stay tuned for the launch of our comprehensive requirements engineering platform
          </p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '0.85rem',
            color: '#5d6b7a'
          }}>
            <span>Powered by AI</span>
            <span style={{ color: '#d0d7df' }}>•</span>
            <span>Enterprise Ready</span>
            <span style={{ color: '#d0d7df' }}>•</span>
            <span>SysML Compatible</span>
          </div>
        </div>
      </div>
      
      {/* Discrete login button in bottom-right corner */}
      <button
        onClick={() => setShowLogin(true)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(31, 94, 255, 0.1)',
          border: '2px solid rgba(31, 94, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          padding: 0,
          boxShadow: '0 4px 20px rgba(31, 94, 255, 0.15)',
          zIndex: 100
        }}
        onMouseEnter={(e) => {
          const target = e.target as HTMLButtonElement;
          target.style.background = 'rgba(31, 94, 255, 0.15)';
          target.style.borderColor = 'rgba(31, 94, 255, 0.3)';
          target.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          const target = e.target as HTMLButtonElement;
          target.style.background = 'rgba(31, 94, 255, 0.1)';
          target.style.borderColor = 'rgba(31, 94, 255, 0.2)';
          target.style.transform = 'scale(1)';
        }}
        title="Sign in to AIRGen"
      >
        <img 
          src="/logo.png" 
          alt="AIRGen Logo" 
          style={{
            width: '32px',
            height: 'auto'
          }}
        />
      </button>
    </div>
    
    <LoginModal 
      isOpen={showLogin} 
      onClose={() => setShowLogin(false)} 
    />
    </>
  );
}