'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { OfflineBanner, Avatar } from '@/components/ui';
import { colors, borderRadius, spacing, CANONICAL_NAV_ITEMS } from '@atlas/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const status = useAuthStore((state) => state.status);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  React.useEffect(() => {
    if (isInitialized && status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [isInitialized, status, router]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
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

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: colors.background,
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
        className="desktop-sidebar"
      >
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
            <div style={{ fontSize: '0.6875rem', color: colors.textSecondary }}>Investimentos</div>
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
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.id}
                href={item.path}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.md}px`,
                  padding: '0.625rem 0.875rem',
                  borderRadius: `${borderRadius.md}px`,
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? colors.accentSubtle : 'transparent',
                  color: isActive ? colors.accent : colors.textSecondary,
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  outline: 'none',
                }}
              >
                <span>{getNavIcon(item.id)}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div
          style={{
            padding: `${spacing.base}px ${spacing.lg}px`,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/profile"
            aria-label="Acessar meu perfil"
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
          </Link>
          <button
            onClick={handleLogout}
            title="Sair da conta"
            aria-label="Sair da conta"
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: '0.375rem',
              fontSize: '1rem',
              borderRadius: `${borderRadius.sm}px`,
            }}
          >
            🚪
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
            padding: `0 ${spacing.xl}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
            <span style={{ fontSize: '0.875rem', color: colors.textSecondary }}>Project Atlas</span>
            <span style={{ color: colors.border }}>/</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
              {CANONICAL_NAV_ITEMS.find(
                (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
              )?.label || (pathname === '/onboarding' ? 'Boas-vindas' : 'Perfil')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.base}px` }}>
            <Link
              href="/profile"
              aria-label="Perfil do usuário"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${spacing.sm}px`,
                fontSize: '0.8125rem',
                color: colors.textSecondary,
                padding: '0.375rem 0.75rem',
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
              }}
            >
              <Avatar name={user?.name} size="sm" />
              <span className="profile-label">{user?.name?.split(' ')[0] || 'Perfil'}</span>
            </Link>
          </div>
        </header>

        {/* Page Content with Max Width container */}
        <main
          style={{
            flex: 1,
            padding: `${spacing.xl}px`,
            overflowY: 'auto',
          }}
        >
          <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
            <OfflineBanner />
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav
          aria-label="Navegação móvel inferior"
          style={{
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            padding: '0.5rem 0',
            display: 'none',
            justifyContent: 'space-around',
            position: 'sticky',
            bottom: 0,
            zIndex: 40,
          }}
          className="mobile-bottom-nav"
        >
          {CANONICAL_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.id}
                href={item.path}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  fontSize: '0.6875rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? colors.accent : colors.textSecondary,
                  padding: '0.25rem 0.5rem',
                  minWidth: '44px',
                  minHeight: '44px',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '1.125rem' }}>{getNavIcon(item.id)}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <style jsx global>{`
        @media (max-width: 767px) {
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-bottom-nav {
            display: flex !important;
          }
          .profile-label {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
