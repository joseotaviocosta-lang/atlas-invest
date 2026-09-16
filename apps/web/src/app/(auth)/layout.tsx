import React from 'react';
import { themeTokens } from '@atlas/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1.5rem',
        backgroundColor: themeTokens.colors.background,
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: `${themeTokens.borderRadius.lg}px`,
              backgroundColor: themeTokens.colors.primary,
              color: '#FFFFFF',
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '1rem',
            }}
          >
            A
          </div>
          <h1
            style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: themeTokens.colors.text,
            }}
          >
            Project Atlas
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              color: themeTokens.colors.textMuted,
            }}
          >
            Gestão inteligente de investimentos
          </p>
        </div>

        <div
          style={{
            backgroundColor: themeTokens.colors.surface,
            border: `1px solid ${themeTokens.colors.border}`,
            borderRadius: `${themeTokens.borderRadius.lg}px`,
            padding: '2rem',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          }}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
