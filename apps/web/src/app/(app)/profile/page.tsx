'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Badge } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { themeTokens } from '@atlas/ui';

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
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1
          style={{
            margin: '0 0 0.375rem 0',
            fontSize: '1.75rem',
            fontWeight: 700,
            color: themeTokens.colors.text,
            letterSpacing: '-0.02em',
          }}
        >
          Meu Perfil
        </h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
          Informações da sua conta e preferências de segurança
        </p>
      </div>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: themeTokens.colors.primary,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              fontWeight: 700,
            }}
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h2
              style={{
                margin: '0 0 0.25rem 0',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: themeTokens.colors.text,
              }}
            >
              {user?.name || 'Investidor'}
            </h2>
            <div style={{ fontSize: '0.875rem', color: themeTokens.colors.textMuted }}>
              {user?.email || 'investidor@atlas.dev'}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            paddingTop: '1rem',
            borderTop: `1px solid ${themeTokens.colors.border}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: themeTokens.colors.textMuted,
                marginBottom: '0.25rem',
              }}
            >
              IDIOMA / LOCALIDADE
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: themeTokens.colors.text }}>
              {user?.locale || 'pt-BR'}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: themeTokens.colors.textMuted,
                marginBottom: '0.25rem',
              }}
            >
              FUSO HORÁRIO
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: themeTokens.colors.text }}>
              {user?.timezone || 'America/Sao_Paulo'}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: themeTokens.colors.textMuted,
                marginBottom: '0.25rem',
              }}
            >
              MOEDA BASE
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: themeTokens.colors.text }}>
              {user?.baseCurrency || 'BRL'}
            </div>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: '1.5rem' }}>
        <h3
          style={{
            margin: '0 0 0.75rem 0',
            fontSize: '1rem',
            fontWeight: 600,
            color: themeTokens.colors.text,
          }}
        >
          Segurança da Sessão Web
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: themeTokens.colors.text }}>
              Armazenamento de Credenciais
            </div>
            <div style={{ fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
              Refresh token gravado em cookie HttpOnly com proteção SameSite e CSRF mitigado.
            </div>
          </div>
          <Badge variant="success">PROTEGIDO</Badge>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: themeTokens.colors.text }}>
              Isolamento de Cache
            </div>
            <div style={{ fontSize: '0.75rem', color: themeTokens.colors.textMuted }}>
              Cache de requisições do TanStack Query purgado automaticamente ao sair.
            </div>
          </div>
          <Badge variant="primary">ATIVO</Badge>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="danger" onClick={handleLogout} isLoading={isLoggingOut}>
          Sair da Conta (Logout)
        </Button>
      </div>
    </div>
  );
}
