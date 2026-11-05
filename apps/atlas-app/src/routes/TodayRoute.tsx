import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider';
import { apiClient } from '../lib/api';
import { colors, borderRadius, spacing } from '@atlas/ui';
import { getRuntimeConfig } from '../config/runtime';
import type { AuthUser } from '@atlas/api-client';

export const TodayRoute: React.FC = () => {
  const { user: localUser } = useAuth();
  const config = getRuntimeConfig();

  // Validate live connection against API with authenticated request
  const { data: meData, isLoading, error } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AuthUser }>('/api/v1/auth/me');
      return res.data;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const currentUser = meData || localUser;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Welcome Banner */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          padding: spacing.xxl,
          marginBottom: spacing.xl,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: colors.textPrimary, letterSpacing: '-0.02em' }}>
              Olá, {currentUser?.name || 'Investidor'}!
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.9375rem', color: colors.textSecondary }}>
              Bem-vindo ao Atlas Desktop • Gestão Patrimonial Segura
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: `${borderRadius.full}px`,
              backgroundColor: `${colors.positive}15`,
              color: colors.positive,
              fontSize: '0.8125rem',
              fontWeight: 600,
              border: `1px solid ${colors.positive}30`,
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
            CONECTADO
          </span>
        </div>

        {/* User context cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: spacing.md,
            marginTop: spacing.xl,
          }}
        >
          <div
            style={{
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: `${borderRadius.md}px`,
              padding: spacing.lg,
            }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              E-mail do Usuário
            </span>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginTop: '4px', color: colors.textPrimary }}>
              {currentUser?.email || '—'}
            </div>
          </div>

          <div
            style={{
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: `${borderRadius.md}px`,
              padding: spacing.lg,
            }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              Armazenamento Seguro
            </span>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginTop: '4px', color: colors.positive }}>
              {config.isTauri ? 'Windows Credential Manager' : 'Memory Adapter (Dev)'}
            </div>
          </div>

          <div
            style={{
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: `${borderRadius.md}px`,
              padding: spacing.lg,
            }}
          >
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.05em' }}>
              Sessão Ativa
            </span>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginTop: '4px', color: colors.accent }}>
              Token Rotativo Ativo
            </div>
          </div>
        </div>
      </div>

      {/* API Diagnostics Card */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${borderRadius.lg}px`,
          padding: spacing.xl,
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
          Status da Conexão com o Backend
        </h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: colors.textSecondary }}>
          Comunicação direta via Shared API Client (@atlas/api-client)
        </p>

        <div
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: `${borderRadius.md}px`,
            padding: spacing.md,
            fontSize: '0.8125rem',
            fontFamily: 'monospace',
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <div><strong>Endpoint:</strong> {config.apiUrl}</div>
          <div><strong>Live Query Status:</strong> {isLoading ? 'Carregando /me...' : error ? `Offline / Falha: ${(error as Error).message}` : '200 OK (/api/v1/auth/me)'}</div>
          <div><strong>Platform Runtime:</strong> {config.isTauri ? 'Tauri 2 Native Window' : 'Vite Browser Harness'}</div>
        </div>
      </div>
    </div>
  );
};
