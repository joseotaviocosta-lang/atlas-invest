'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, SectionHeader, Card, Button, Badge, Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { colors, spacing, borderRadius } from '@atlas/ui';

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/login');
    } catch {
      router.replace('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      <PageHeader
        title="Perfil"
        subtitle="Gerencie suas informações cadastrais, preferências e segurança da sessão"
      />

      {/* Personal Information */}
      <Card style={{ marginBottom: `${spacing.xl}px`, padding: `${spacing.xl}px` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.base}px`,
            marginBottom: `${spacing.xl}px`,
          }}
        >
          <Avatar name={user?.name} size="lg" />
          <div>
            <h2
              style={{
                margin: '0 0 4px 0',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: colors.textPrimary,
              }}
            >
              {user?.name || 'Investidor'}
            </h2>
            <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
              {user?.email || 'investidor@atlas.dev'}
            </div>
          </div>
        </div>

        <SectionHeader title="Preferências Globais" description="Parâmetros de localização e formatação financeira" />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: `${spacing.base}px`,
            paddingTop: `${spacing.md}px`,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '4px' }}>
              MOEDA BASE
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
              BRL (Real brasileiro)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '4px' }}>
              IDIOMA / LOCALIDADE
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
              Português (Brasil) • pt-BR
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '4px' }}>
              FUSO HORÁRIO
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
              America/Sao_Paulo (UTC-03:00)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '4px' }}>
              TEMA VISUAL
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
              Dark Theme (Canônico)
            </div>
          </div>
        </div>
      </Card>

      {/* Security and Session Information */}
      <Card style={{ marginBottom: `${spacing.xl}px`, padding: `${spacing.xl}px` }}>
        <SectionHeader
          title="Segurança e Sessão"
          description="Controles criptográficos e políticas de isolamento de dados"
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px`, marginTop: `${spacing.md}px` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                BFF com Cookies HttpOnly
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '2px' }}>
                Refresh token rotativo mantido exclusivamente no servidor com SameSite=Lax e validação de Origin.
              </div>
            </div>
            <Badge variant="positive">PROTEGIDO</Badge>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                Isolamento Compulsório de Cache
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '2px' }}>
                Purga total do cache do TanStack Query na revogação da sessão para prevenir vazamento cross-user.
              </div>
            </div>
            <Badge variant="primary">ATIVO</Badge>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${spacing.md}px`,
              borderRadius: `${borderRadius.md}px`,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.textPrimary }}>
                Token em Memória Volátil
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '2px' }}>
                Access token nunca persistido em localStorage, sessionStorage ou IndexedDB.
              </div>
            </div>
            <Badge variant="positive">SEGURO</Badge>
          </div>
        </div>
      </Card>

      {/* Logout Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="danger" onClick={handleLogout} isLoading={isLoggingOut}>
          Sair da Conta (Logout)
        </Button>
      </div>
    </div>
  );
}
