import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { colors } from '@atlas/ui';

export const ProtectedRoute: React.FC = () => {
  const { isRestoring, isAuthenticated, runtimeMode } = useAuth();

  if (isRestoring) {
    return (
      <div
        data-testid="restoring-splash"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: colors.background,
          color: colors.textPrimary,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: `3px solid ${colors.surfaceElevated}`,
            borderTopColor: colors.accent,
            animation: 'spin 0.8s linear infinite',
            marginBottom: '1rem',
          }}
        />
        <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
          Carregando Atlas Desktop...
        </div>
      </div>
    );
  }

  // In DESKTOP_LOCAL_OWNER, the local owner profile is granted direct access.
  // Never redirect to /login.
  if (runtimeMode === 'DESKTOP_LOCAL_OWNER') {
    return <Outlet />;
  }

  // In REMOTE_AUTHENTICATED, require active authenticated session
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
