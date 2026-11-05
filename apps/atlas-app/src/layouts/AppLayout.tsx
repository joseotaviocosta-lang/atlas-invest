import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { Avatar, Badge } from '../components/ui';
import { PortfolioSwitcher } from '../features/portfolio/components/PortfolioSwitcher';
import { ManualRefreshButton } from '../features/portfolio/components/ManualRefreshButton';
import { NotificationBellButton } from '../features/notifications';
import { usePendingReviewsCount } from '../features/imports/hooks';
import { colors, borderRadius, spacing, CANONICAL_NAV_ITEMS } from '@atlas/ui';
import { getRuntimeConfig } from '../config/runtime';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import { useAndroidBackButton } from '../hooks/useAndroidBackButton';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const config = getRuntimeConfig();
  const { data: pendingReviewsCount = 0 } = usePendingReviewsCount();
  const { isMobile } = useBreakpoint();

  // Lifecycle & hardware back integration
  const { isOnline } = useAppLifecycle();
  useAndroidBackButton();

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
      case 'import':
        return '📥';
      case 'market':
        return '📈';
      case 'tax':
        return '📑';
      case 'ai':
        return '✨';
      case 'settings':
        return '👤';
      default:
        return '●';
    }
  };

  const getCurrentPageTitle = () => {
    if (location.pathname === '/import' || location.pathname.startsWith('/import/')) {
      return 'Importações & Conciliação';
    }
    if (location.pathname === '/settings' || location.pathname.startsWith('/settings/')) {
      return 'Perfil & Configurações';
    }
    const currentItem = CANONICAL_NAV_ITEMS.find(
      (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    );
    return currentItem ? currentItem.label : 'Atlas';
  };

  // Mobile canonical 5 bottom tabs
  const mobileTabs = [
    { id: 'today', path: '/today', label: 'Hoje', icon: '📅' },
    { id: 'portfolio', path: '/portfolio', label: 'Carteira', icon: '💼' },
    { id: 'market', path: '/market', label: 'Mercado', icon: '📈' },
    { id: 'tax', path: '/tax', label: 'Fiscal', icon: '📑' },
    { id: 'settings', path: '/settings', label: 'Perfil', icon: '👤' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: colors.background,
        color: colors.textPrimary,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
      data-testid="app-layout"
    >
      {/* Desktop Sidebar (hidden on mobile via CSS class desktop-only) */}
      <aside
        className="desktop-only"
        style={{
          width: '240px',
          borderRight: `1px solid ${colors.border}`,
          backgroundColor: colors.surface,
          flexDirection: 'column',
          flexShrink: 0,
        }}
        data-testid="desktop-sidebar"
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
          aria-label="Navegação principal desktop"
          style={{
            padding: `${spacing.base}px ${spacing.sm}px`,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {[
            { id: 'today', path: '/today', label: 'Hoje' },
            { id: 'portfolio', path: '/portfolio', label: 'Carteira' },
            { id: 'import', path: '/import', label: 'Importar' },
            { id: 'market', path: '/market', label: 'Mercado' },
            { id: 'tax', path: '/tax', label: 'Fiscal' },
            { id: 'ai', path: '/ai', label: 'IA' },
          ].map((item) => {
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
                  minHeight: '44px',
                }}
              >
                <span>{getNavIcon(item.id)}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.id === 'import' && pendingReviewsCount > 0 && (
                  <Badge variant="warning">{pendingReviewsCount}</Badge>
                )}
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
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '1rem' }}>🚪</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        {/* Desktop Header */}
        <header
          className="desktop-only"
          style={{
            height: '60px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `0 ${spacing.xl}px`,
          }}
          data-testid="desktop-header"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
              {getCurrentPageTitle()}
            </div>
            <PortfolioSwitcher />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <NotificationBellButton />
            <ManualRefreshButton variant="outline" />
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

        {/* Mobile Compact Header (visible only on mobile) */}
        <header
          className="mobile-only"
          style={{
            minHeight: '54px',
            paddingTop: 'calc(var(--sat, 0px) + 6px)',
            paddingBottom: '8px',
            paddingLeft: 'calc(var(--sal, 0px) + 16px)',
            paddingRight: 'calc(var(--sar, 0px) + 16px)',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}
          data-testid="mobile-header"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: `${borderRadius.sm}px`,
                backgroundColor: colors.accent,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.875rem',
              }}
            >
              A
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.textPrimary }}>
              {getCurrentPageTitle()}
            </div>
            {!isOnline && (
              <span
                data-testid="mobile-offline-indicator"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: `${borderRadius.full}px`,
                  backgroundColor: `${colors.warning}20`,
                  color: colors.warning,
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  border: `1px solid ${colors.warning}40`,
                }}
              >
                📡 Offline
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
            <NotificationBellButton />
            <PortfolioSwitcher />
            <NavLink
              to="/settings"
              aria-label="Perfil"
              data-testid="mobile-profile-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '44px',
                minHeight: '44px',
                textDecoration: 'none',
              }}
            >
              <Avatar name={user?.name} size="sm" />
            </NavLink>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main
          style={{
            flex: 1,
            padding: isMobile ? `${spacing.base}px` : `${spacing.xxl}px`,
            paddingBottom: isMobile
              ? 'calc(var(--bottom-nav-height, 56px) + var(--sab, 0px) + 20px)'
              : `${spacing.xxl}px`,
            paddingLeft: isMobile ? 'calc(var(--sal, 0px) + 16px)' : `${spacing.xxl}px`,
            paddingRight: isMobile ? 'calc(var(--sar, 0px) + 16px)' : `${spacing.xxl}px`,
            overflowY: 'auto',
          }}
          data-testid="main-content"
        >
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation (visible only on mobile) */}
        <nav
          className="mobile-only"
          aria-label="Navegação móvel inferior"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            backgroundColor: colors.surface,
            borderTop: `1px solid ${colors.border}`,
            paddingBottom: 'var(--sab, 0px)',
            justifyContent: 'space-around',
            alignItems: 'center',
            height: 'calc(var(--bottom-nav-height, 56px) + var(--sab, 0px))',
          }}
          data-testid="mobile-bottom-nav"
        >
          {mobileTabs.map((tab) => {
            const isActive = location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);
            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`bottom-nav-${tab.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  height: '100%',
                  minHeight: '44px',
                  minWidth: '44px',
                  textDecoration: 'none',
                  color: isActive ? colors.accent : colors.textSecondary,
                  transition: 'color 0.15s ease-in-out',
                  padding: '4px 0',
                }}
              >
                <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{tab.icon}</span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: isActive ? 600 : 500,
                    marginTop: '2px',
                    color: isActive ? colors.accent : colors.textSecondary,
                  }}
                >
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
