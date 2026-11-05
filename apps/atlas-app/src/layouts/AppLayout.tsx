import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { Avatar } from '../components/ui';
import { colors, borderRadius, spacing, CANONICAL_NAV_ITEMS } from '@atlas/ui';
import { getRuntimeConfig } from '../config/runtime';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const config = getRuntimeConfig();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getNavIcon = (id: string) => {
    switch (id) {
      case 'today':
        return '📅';
      case 'portfolio':
        return '💼';
      case 'market':
        return '📈';
      case 'tax':
        return '📑';
      case 'ai':
        return '✨';
      default:
        return '●';
    }
  };

  const getCurrentPageTitle = () => {
    const currentItem = CANONICAL_NAV_ITEMS.find(
      (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    );
    return currentItem ? currentItem.label : 'Atlas Desktop';
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: colors.background,
        color: colors.textPrimary,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Desktop Sidebar */}
      <aside
        style={{
          width: '240px',
          borderRight: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Brand header */}
        <div
          style={{
            padding: `${spacing.xl}px ${spacing.lg}px`,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.md}px`,
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.accent,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: colors.textPrimary }}>
              Project Atlas
            </div>
            <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>
              Windows Desktop
            </div>
          </div>
        </div>

        {/* Navigation items */}
        <nav
          aria-label="Navegação principal"
          style={{
            padding: `${spacing.base}px ${spacing.sm}px`,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {CANONICAL_NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <NavLink
                key={item.id}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.md}px`,
                  padding: '0.625rem 0.875rem',
                  borderRadius: `${borderRadius.md}px`,
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? `${colors.accent}15` : 'transparent',
                  color: isActive ? colors.accent : colors.textSecondary,
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  outline: 'none',
                }}
              >
                <span>{getNavIcon(item.id)}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer with Logout */}
        <div
          style={{
            padding: `${spacing.base}px ${spacing.lg}px`,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.md}px`,
              overflow: 'hidden',
              flex: 1,
            }}
          >
            <Avatar name={user?.name} size="sm" />
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: colors.textPrimary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.name || 'Investidor'}
              </div>
              <div
                style={{
                  fontSize: '0.6875rem',
                  color: colors.textSecondary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.email || ''}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sair da conta"
            aria-label="Sair da conta"
            data-testid="logout-button"
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: '0.375rem',
              borderRadius: `${borderRadius.sm}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '1rem' }}>🚪</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header */}
        <header
          style={{
            height: '60px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `0 ${spacing.xl}px`,
          }}
        >
          <div style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
            {getCurrentPageTitle()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: `${borderRadius.full}px`,
                backgroundColor: `${colors.positive}15`,
                color: colors.positive,
                fontSize: '0.75rem',
                fontWeight: 600,
                border: `1px solid ${colors.positive}30`,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: colors.positive,
                }}
              />
              {config.isTauri ? 'NATIVO' : 'DEV HARNESS'}
            </span>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main style={{ flex: 1, padding: spacing.xxl, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
