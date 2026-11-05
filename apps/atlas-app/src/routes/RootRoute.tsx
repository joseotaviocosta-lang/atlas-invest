import React, { useState, useEffect } from 'react';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { getRuntimeConfig } from '../config/runtime';
import { sessionManager } from '../lib/api';
import type { AuthState } from '@atlas/api-client';

export const RootRoute: React.FC = () => {
  const config = getRuntimeConfig();
  const [authState, setAuthState] = useState<AuthState>(() => sessionManager.getAuthState());
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((nextState) => {
      setAuthState(nextState);
    });

    let isMounted = true;
    sessionManager
      .restoreSession()
      .catch(() => {
        // Safe failure: error handled by sessionManager
      })
      .finally(() => {
        if (isMounted) {
          setIsRestoring(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const getStatusLabel = () => {
    if (isRestoring) return 'RESTORING';
    if (authState.status === 'authenticated') return 'AUTHENTICATED';
    return 'ANONYMOUS';
  };

  const getStatusColor = () => {
    if (isRestoring) return colors.warning;
    if (authState.status === 'authenticated') return colors.positive;
    return colors.textSecondary;
  };

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
              backgroundColor: `${config.isTauri ? colors.positive : colors.accent}20`,
              color: config.isTauri ? colors.positive : colors.accent,
              fontSize: '12px',
              fontWeight: 600,
              border: `1px solid ${config.isTauri ? colors.positive : colors.accent}40`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: config.isTauri ? colors.positive : colors.accent,
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
              Sessão / Auth State
            </span>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px', color: getStatusColor() }}>
              {getStatusLabel()}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              Secure Storage Engine
            </span>
            <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px', color: colors.textPrimary }}>
              {config.isTauri ? 'Windows Credential Manager (DPAPI)' : 'In-Memory Secure Adapter'}
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
            Fundação nativa do aplicativo <strong>Atlas</strong> com armazenamento protegido pelo sistema operacional.
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Windows Credential Manager / DPAPI (keyring)</li>
            <li>Access token estritamente em memória volátil</li>
            <li>Session boot restore automático</li>
            <li>Single-flight refresh e rotação atômica</li>
            <li>Zero tokens em Web storage, logs ou arquivos de texto</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
