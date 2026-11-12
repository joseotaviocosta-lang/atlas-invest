import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, spacing, borderRadius } from '@atlas/ui';
import { useAuth } from '../providers/AuthProvider';
import { usePortfolio } from '../providers/PortfolioProvider';
import { Card, Avatar, Badge, Button } from '../components/ui';
import { getRuntimeConfig } from '../config/runtime';
import { NotificationSettingsSection, useNotifications } from '../features/notifications';
import { exportDiagnostics } from '../lib/diagnostics';
import { MarketDataProviderCard } from '../features/market/components/MarketDataProviderCard';
import { LocalBackupCard, RestoreReadinessCard } from '../features/backup';

export type SettingsTab = 'ALL' | 'profile' | 'market' | 'backup' | 'notifications' | 'diagnostics' | 'system';

export const SettingsRoute: React.FC = () => {
  const { user, logout, runtimeMode, clearLocalData } = useAuth();
  const { selectedPortfolio } = usePortfolio();
  const { newsMonitoring } = useNotifications();
  const navigate = useNavigate();
  const config = getRuntimeConfig();
  const [activeTab, setActiveTab] = useState<SettingsTab>('ALL');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [clearStatus, setClearStatus] = useState<string | null>(null);

  const isLocalOwner = runtimeMode === 'DESKTOP_LOCAL_OWNER';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleCloseAtlas = async () => {
    try {
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        // @ts-expect-error tauri dynamic access
        await window.__TAURI__?.window?.getCurrentWindow()?.close();
        return;
      }
    } catch {
      // Fallback
    }
    if (typeof window !== 'undefined') {
      window.close();
    }
  };

  const handleClearLocalCache = () => {
    clearLocalData();
    setIsConfirmingClear(false);
    setClearStatus('Cache e dados temporários locais limpos com sucesso.');
  };

  const handleExportDiagnostics = async () => {
    try {
      setExportStatus('Exportando diagnóstico sanitizado...');
      const res = await exportDiagnostics({
        isAuthenticated: Boolean(user),
        hasActivePortfolio: Boolean(selectedPortfolio),
        newsMonitoring,
      });
      if (res.mode === 'download') {
        setExportStatus('Diagnóstico exportado como JSON com sucesso.');
      } else {
        setExportStatus('Diagnóstico copiado para a área de transferência.');
      }
    } catch {
      setExportStatus('Falha ao exportar diagnóstico.');
    }
  };

  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const tabs: Array<{ id: SettingsTab; label: string; icon: string }> = [
    { id: 'ALL', label: 'Todas as Seções', icon: '📋' },
    { id: 'profile', label: 'Perfil', icon: '👤' },
    { id: 'market', label: 'Mercado', icon: '📈' },
    { id: 'backup', label: 'Backup', icon: '💾' },
    { id: 'notifications', label: 'Notificações', icon: '🔔' },
    { id: 'diagnostics', label: 'Diagnóstico', icon: '🩺' },
    { id: 'system', label: 'Sistema', icon: 'ℹ️' },
  ];

  const showProfile = activeTab === 'ALL' || activeTab === 'profile';
  const showMarket = activeTab === 'ALL' || activeTab === 'market';
  const showBackup = activeTab === 'ALL' || activeTab === 'backup';
  const showNotifications = activeTab === 'ALL' || activeTab === 'notifications';
  const showDiagnostics = activeTab === 'ALL' || activeTab === 'diagnostics';
  const showSystem = activeTab === 'ALL' || activeTab === 'system';

  return (
    <div
      style={{
        maxWidth: '850px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacing.lg}px`,
      }}
      data-testid="settings-route"
    >
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
          Gerenciamento local, conectividade de dados, retenção de backups e auditoria do sistema
        </p>
      </div>

      {/* Navigation Sub-Tabs (PARTE W) */}
      <div
        style={{
          display: 'flex',
          gap: `${spacing.xs}px`,
          borderBottom: `1px solid ${colors.border}`,
          overflowX: 'auto',
          paddingBottom: `${spacing.xs}px`,
        }}
      >
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.5rem 0.875rem',
                borderRadius: `${borderRadius.md}px`,
                border: 'none',
                backgroundColor: isActive ? `${colors.accent}15` : 'transparent',
                color: isActive ? colors.accent : colors.textSecondary,
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section: Perfil */}
      {showProfile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.md}px` }}>
              <Avatar name={isLocalOwner ? 'Owner' : user?.name} size="lg" />
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
                  {isLocalOwner ? 'Owner' : (user?.name || 'Investidor Atlas')}
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
                  {isLocalOwner ? 'Perfil: Owner (Desktop Local)' : (user?.email || 'investidor@atlas.com.br')}
                </div>
                <div style={{ marginTop: `${spacing.xs}px` }}>
                  {isLocalOwner ? (
                    <Badge variant="neutral">Modo Desktop Local</Badge>
                  ) : (
                    <Badge variant="positive">Sessão Autenticada</Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Section: Sistema & Metadados (Ambiente e Plataforma) */}
      {showSystem && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          <Card>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: `0 0 ${spacing.md}px 0` }}>
              Ambiente e Plataforma
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: `${spacing.md}px`, fontSize: '0.8125rem' }}>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Versão do App</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  v{config.version}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Build SHA</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontFamily: 'monospace' }}>
                  {config.commitSha}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Data do Build</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  {config.buildDate}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Modo de Operação</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  {isLocalOwner ? 'Desktop Local (Owner)' : 'Autenticado Remoto'}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Plataforma</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  {isAndroid ? 'Android (ARM64)' : config.isTauri ? 'Windows Desktop (Tauri 2)' : 'Web / Harness'}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Runtime</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>Tauri 2 Unified App</div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Ambiente</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary, textTransform: 'capitalize' }}>
                  {config.environment} ({config.buildType})
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Backend de Dados</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary, wordBreak: 'break-all' }}>
                  {config.dataBackendLabel}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textSecondary, marginBottom: '2px' }}>Banco de Dados Local</div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  atlas_local (Porta 5434)
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: `0 0 ${spacing.xs}px 0` }}>
              Estratégia de Atualização &amp; Manutenção Local
            </h3>
            <p style={{ margin: `0 0 ${spacing.sm}px 0`, fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.5 }}>
              O Atlas opera em regime local-first com banco de dados isolado. Atualizações de versão aplicam apenas pacotes
              validados com integridade de schema e migrações idempotentes.
            </p>
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                borderRadius: `${borderRadius.md}px`,
                backgroundColor: colors.surfaceHover,
                border: `1px solid ${colors.border}`,
                fontSize: '0.75rem',
                color: colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: colors.textPrimary }}>Prática Recomendada:</strong> Antes de aplicar novos pacotes ou executáveis,
              gere um backup local pelo módulo de Backup (aba Backup) para garantir prontidão de restauração fail-safe.
            </div>
          </Card>
        </div>
      )}

      {/* Section: Mercado */}
      {showMarket && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          <MarketDataProviderCard />
        </div>
      )}

      {/* Section: Backup */}
      {showBackup && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          <LocalBackupCard />
          <RestoreReadinessCard />
        </div>
      )}

      {/* Section: Notificações */}
      {showNotifications && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          <NotificationSettingsSection />
        </div>
      )}

      {/* Section: Diagnóstico */}
      {showDiagnostics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.lg}px` }}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
                Diagnóstico e Suporte Técnico
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.5 }}>
                Gera um relatório técnico seguro para diagnóstico em caso de instabilidade. O pacote é estritamente
                sanitizado contra tokens, senhas, CPF ou dados bancários/financeiros completos.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginTop: `${spacing.xs}px`, flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportDiagnostics}
                  data-testid="settings-export-diagnostics-btn"
                >
                  Exportar Diagnóstico Sanitizado
                </Button>
                {exportStatus && (
                  <span style={{ fontSize: '0.8125rem', color: colors.accent, fontWeight: 500 }}>
                    {exportStatus}
                  </span>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.textPrimary, margin: `0 0 ${spacing.sm}px 0` }}>
              Segurança e Armazenamento Local
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem', color: colors.textSecondary, lineHeight: 1.6 }}>
              {isLocalOwner ? (
                <>
                  <li>
                    <strong style={{ color: colors.textPrimary }}>Modo de Operação:</strong> Desktop Local para uso pessoal exclusivo do Owner (Zero tráfego de autenticação remota).
                  </li>
                  <li>
                    <strong style={{ color: colors.textPrimary }}>Armazenamento Seguro:</strong> Sem credenciais ou tokens remotos armazenados no Credential Manager.
                  </li>
                  <li>
                    <strong style={{ color: colors.textPrimary }}>Isolamento de Cache:</strong> Namespace exclusivo <code>atlas.cache.v1.local-owner</code>.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <strong style={{ color: colors.textPrimary }}>Access Token (JWT):</strong> Mantido estritamente em memória volátil (Zero persistência em disco).
                  </li>
                  <li>
                    <strong style={{ color: colors.textPrimary }}>Segurança de Armazenamento:</strong> Proibido uso de localStorage ou texto plano para refresh tokens.
                  </li>
                  <li>
                    <strong style={{ color: colors.textPrimary }}>Permissões Mínimas:</strong> Operação restrita a tráfego de rede (INTERNET).
                  </li>
                </>
              )}
            </ul>

            {/* Local Data Management */}
            {isLocalOwner && (
              <div style={{ marginTop: `${spacing.md}px`, paddingTop: `${spacing.md}px`, borderTop: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.textPrimary, marginBottom: `${spacing.xs}px` }}>
                  Gerenciamento de Dados Locais
                </div>
                <p style={{ margin: `0 0 ${spacing.sm}px 0`, fontSize: '0.75rem', color: colors.textSecondary }}>
                  Permite limpar o cache de consultas e leituras offline. Não afeta a base de dados PostgreSQL.
                </p>
                {!isConfirmingClear ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsConfirmingClear(true)}
                    data-testid="settings-clear-cache-btn"
                  >
                    Limpar Cache Local
                  </Button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleClearLocalCache}
                      data-testid="settings-confirm-clear-cache-btn"
                    >
                      Confirmar Limpeza
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsConfirmingClear(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
                {clearStatus && (
                  <div style={{ marginTop: `${spacing.xs}px`, fontSize: '0.75rem', color: colors.accent }}>
                    {clearStatus}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* App Exit / Logout action */}
      <div style={{ marginTop: `${spacing.sm}px` }}>
        {isLocalOwner ? (
          <Button
            variant="secondary"
            size="md"
            onClick={handleCloseAtlas}
            data-testid="settings-close-app-btn"
            style={{ width: '100%', minHeight: '44px', justifyContent: 'center' }}
          >
            Fechar Atlas
          </Button>
        ) : (
          <Button
            variant="danger"
            size="md"
            onClick={handleLogout}
            data-testid="settings-logout-btn"
            style={{ width: '100%', minHeight: '44px', justifyContent: 'center' }}
          >
            Encerrar Sessão (Logout)
          </Button>
        )}
      </div>
    </div>
  );
};
