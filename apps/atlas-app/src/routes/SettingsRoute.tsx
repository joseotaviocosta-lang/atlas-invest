import React from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, spacing } from '@atlas/ui';
import { useAuth } from '../providers/AuthProvider';
import { usePortfolio } from '../providers/PortfolioProvider';
import { Card, Avatar, Badge, Button } from '../components/ui';
import { getRuntimeConfig } from '../config/runtime';

export const SettingsRoute: React.FC = () => {
  const { user, logout } = useAuth();
  const { selectedPortfolio, portfolios } = usePortfolio();
  const navigate = useNavigate();
  const config = getRuntimeConfig();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }} data-testid="settings-route">
      <div>
        <h1
          style={{
            margin: '0 0 4px 0',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: colors.textPrimary,
          }}
        >
          Perfil &amp; Configurações
        </h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
          Gerenciamento de conta, conectividade e auditoria de segurança da sessão
        </p>
      </div>

      {/* User Identity Card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
          <Avatar name={user?.name} size="lg" />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <h2
              style={{
                margin: '0 0 2px 0',
                fontSize: '1.125rem',
                fontWeight: 700,
                color: colors.textPrimary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user?.name || 'Investidor Atlas'}
            </h2>
            <div
              style={{
                fontSize: '0.8125rem',
                color: colors.textSecondary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user?.email || 'investidor@atlas.com.br'}
            </div>
            <div style={{ marginTop: `${spacing.xs}px` }}>
              <Badge variant="positive">Sessão Autenticada</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Device & Platform Environment */}
      <Card>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: `0 0 ${spacing.md}px 0` }}>
          Ambiente e Plataforma
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: `${spacing.md}px`, fontSize: '0.8125rem' }}>
          <div>
            <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Plataforma</div>
            <div style={{ fontWeight: 600, color: colors.textPrimary }}>
              {isAndroid ? 'Android (ARM64)' : config.isTauri ? 'Windows Desktop' : 'Web / Harness'}
            </div>
          </div>
          <div>
            <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Runtime</div>
            <div style={{ fontWeight: 600, color: colors.textPrimary }}>Tauri 2 Unified App</div>
          </div>
          <div>
            <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Servidor API</div>
            <div style={{ fontWeight: 600, color: colors.textPrimary, wordBreak: 'break-all' }}>
              {config.apiUrl}
            </div>
          </div>
          <div>
            <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Carteiras Ativas</div>
            <div style={{ fontWeight: 600, color: colors.textPrimary }}>
              {portfolios.length} ({selectedPortfolio?.name || 'Padrão'})
            </div>
          </div>
        </div>
      </Card>

      {/* Security Invariants & Storage */}
      <Card>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: `0 0 ${spacing.sm}px 0` }}>
          Segurança e Armazenamento Local
        </h3>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.6 }}>
          <li>
            <strong style={{ color: colors.textPrimary }}>Access Token (JWT):</strong> Mantido estritamente em memória volátil (Zero persistência em disco).
          </li>
          <li>
            <strong style={{ color: colors.textPrimary }}>Segurança de Armazenamento:</strong> Proibido uso de localStorage ou texto plano para refresh tokens.
          </li>
          <li>
            <strong style={{ color: colors.textPrimary }}>Permissões Mínimas:</strong> Operação restrita a tráfego de rede (INTERNET).
          </li>
        </ul>
      </Card>

      {/* Logout Action */}
      <div style={{ marginTop: `${spacing.sm}px` }}>
        <Button
          variant="danger"
          size="md"
          onClick={handleLogout}
          data-testid="settings-logout-btn"
          style={{ width: '100%', minHeight: '48px', justifyContent: 'center' }}
        >
          Encerrar Sessão (Logout)
        </Button>
      </div>
    </div>
  );
};

