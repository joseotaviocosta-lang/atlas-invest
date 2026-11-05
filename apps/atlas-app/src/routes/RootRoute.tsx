import React from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { getRuntimeConfig } from '../config/runtime';

export const RootRoute: React.FC = () => {
  const config = getRuntimeConfig();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: colors.background,
        color: colors.textPrimary,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: spacing.xl,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.lg,
          padding: spacing.xxl,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: colors.textPrimary, letterSpacing: '-0.02em' }}>
              Atlas
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: colors.textSecondary }}>
              Desktop Foundation • Windows Native
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: borderRadius.full,
              backgroundColor: `${colors.positive}20`,
              color: colors.positive,
              fontSize: '12px',
              fontWeight: 600,
              border: `1px solid ${colors.positive}40`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: colors.positive,
              }}
            />
            {config.isTauri ? 'TAURI NATIVE' : 'BROWSER HARNESS'}
          </span>
        </div>

        <div
          style={{
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: spacing.md,
          }}
        >
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              Versão
            </span>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px', color: colors.textPrimary }}>
              {`v${config.version}`}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              Plataforma
            </span>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px', color: colors.textPrimary }}>
              {config.isTauri ? 'Tauri 2 (Windows)' : 'Vite Dev Harness'}
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              Backend API Endpoint
            </span>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', marginTop: '2px', color: colors.accent }}>
              {config.apiUrl}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            Fundação nativa do aplicativo <strong>Atlas</strong> inicializada com sucesso no ambiente desktop.
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Tauri 2 Windows Runtime</li>
            <li>React 18 + Vite Bundler</li>
            <li>TanStack Query Client</li>
            <li>Atlas Shared API Client (@atlas/api-client)</li>
            <li>Design Tokens Unificados (@atlas/ui)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

