'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { OfflineBanner } from '@/components/ui';
import { themeTokens } from '@atlas/ui';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Hoje', href: '/today', icon: '📅' },
  { label: 'Carteira', href: '/portfolio', icon: '💼' },
  { label: 'Mercado', href: '/market', icon: '📈' },
  { label: 'Fiscal', href: '/tax', icon: '📑' },
  { label: 'IA', href: '/ai', icon: '✨' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: themeTokens.colors.background,
      }}
    >
      {/* Desktop Sidebar */}
      <aside
        style={{
          width: '240px',
          borderRight: `1px solid ${themeTokens.colors.border}`,
          backgroundColor: themeTokens.colors.surface,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
        className="desktop-sidebar"
      >
        <div
          style={{
            padding: '1.5rem 1.25rem',
            borderBottom: `1px solid ${themeTokens.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: `${themeTokens.borderRadius.md}px`,
              backgroundColor: themeTokens.colors.primary,
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
            <div style={{ fontWeight: 700, fontSize: '1rem', color: themeTokens.colors.text }}>
              Project Atlas
            </div>
            <div style={{ fontSize: '0.6875rem', color: themeTokens.colors.textMuted }}>
              Investimentos
            </div>
          </div>
        </div>

        {/* Navigation items */}
        <nav
          style={{
            padding: '1rem 0.75rem',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem 0.875rem',
                  borderRadius: `${themeTokens.borderRadius.md}px`,
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? 'rgba(10, 132, 255, 0.12)' : 'transparent',
                  color: isActive ? themeTokens.colors.primary : themeTokens.colors.textMuted,
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderTop: `1px solid ${themeTokens.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#232936',
                color: themeTokens.colors.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: themeTokens.colors.text,
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
                  color: themeTokens.colors.textMuted,
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
            style={{
              background: 'transparent',
              border: 'none',
              color: themeTokens.colors.textMuted,
              cursor: 'pointer',
              padding: '0.25rem',
              fontSize: '1rem',
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
            borderBottom: `1px solid ${themeTokens.colors.border}`,
            backgroundColor: themeTokens.colors.surface,
            padding: '0 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
              Project Atlas
            </span>
            <span style={{ color: themeTokens.colors.border }}>/</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: themeTokens.colors.text }}>
              {NAV_ITEMS.find(
                (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
              )?.label || 'Visão Geral'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link
              href="/profile"
              style={{
                fontSize: '0.8125rem',
                color: themeTokens.colors.textMuted,
                padding: '0.375rem 0.75rem',
                borderRadius: `${themeTokens.borderRadius.md}px`,
                backgroundColor: '#11161F',
                border: `1px solid ${themeTokens.colors.border}`,
              }}
            >
              Meu Perfil
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
          <OfflineBanner />
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav
          style={{
            borderTop: `1px solid ${themeTokens.colors.border}`,
            backgroundColor: themeTokens.colors.surface,
            padding: '0.5rem 0',
            display: 'none',
            justifyContent: 'space-around',
            position: 'sticky',
            bottom: 0,
            zIndex: 40,
          }}
          className="mobile-bottom-nav"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.125rem',
                  fontSize: '0.6875rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? themeTokens.colors.primary : themeTokens.colors.textMuted,
                  padding: '0.25rem 0.5rem',
                }}
              >
                <span style={{ fontSize: '1.125rem' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-bottom-nav {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
