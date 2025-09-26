import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './Spinner';

type ProtectedRouteProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredTenant?: string;
  requiredRoles?: string[];
};

export function ProtectedRoute({ 
  children, 
  fallback,
  requiredTenant,
  requiredRoles = []
}: ProtectedRouteProps): JSX.Element {
  const { user, isLoading } = useAuth();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh'
      }}>
        <Spinner />
      </div>
    );
  }

  // If no user, show fallback (login page)
  if (!user) {
    return <>{fallback}</>;
  }

  // Check tenant access if required
  if (requiredTenant && !user.tenantSlugs.includes(requiredTenant)) {
    return (
      <div className="panel" style={{
        margin: '2rem',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2>Access Denied</h2>
        <p>You don't have access to the tenant: {requiredTenant}</p>
      </div>
    );
  }

  // Check role access if required
  if (requiredRoles.length > 0 && !requiredRoles.some(role => user.roles.includes(role))) {
    return (
      <div className="panel" style={{
        margin: '2rem',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2>Access Denied</h2>
        <p>You don't have the required permissions to access this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}