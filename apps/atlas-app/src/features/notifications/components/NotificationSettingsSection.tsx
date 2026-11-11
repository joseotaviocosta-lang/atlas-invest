import React, { useState } from 'react';
import { useNotifications } from '../NotificationProvider';
import { Card, Button, Badge } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

export const NotificationSettingsSection: React.FC = () => {
  const {
    permissionState,
    requestPermission,
    preferences,
    updatePreferences,
    sendTestNotification,
  } = useNotifications();

  const [testStatus, setTestStatus] = useState<string | null>(null);

  const handleTestNotification = async () => {
    setTestStatus('Enviando...');
    const ok = await sendTestNotification();
    if (ok) {
      setTestStatus('Enviada com sucesso!');
    } else {
      setTestStatus('Falha ao enviar (verifique permissões do sistema).');
    }
    setTimeout(() => setTestStatus(null), 3000);
  };

  return (
    <Card>
      <div style={{ padding: spacing.lg }}>
        <div style={{ marginBottom: spacing.lg }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem', fontWeight: 600, color: colors.textPrimary }}>
            Preferências de Notificações
          </h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: colors.textSecondary }}>
            Controle lembretes fiscais, revisões de conciliação e horário de silêncio
          </p>
        </div>

        {/* OS Permission Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: spacing.md,
            backgroundColor: colors.surfaceHover,
            borderRadius: borderRadius.md,
            marginBottom: spacing.lg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: 2 }}>
              Permissão do Sistema Operacional
            </div>
            <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
              {permissionState === 'granted'
                ? 'Notificações autorizadas pelo sistema operacional'
                : permissionState === 'denied'
                ? 'Notificações bloqueadas nas configurações do dispositivo'
                : 'Permissão pendente de autorização'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Badge variant={permissionState === 'granted' ? 'success' : 'warning'}>
              {permissionState === 'granted' ? 'Ativo' : 'Não autorizado'}
            </Badge>
            {permissionState !== 'granted' && (
              <Button size="sm" variant="secondary" onClick={requestPermission}>
                Solicitar
              </Button>
            )}
          </div>
        </div>

        {/* Main Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                Notificações Locais Globais
              </div>
              <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                Habilita todos os alertas e lembretes derivados no dispositivo
              </div>
            </div>
            <input
              type="checkbox"
              checked={preferences.enabled}
              onChange={(e) => updatePreferences({ enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: colors.accent }}
            />
          </label>

          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 500, color: colors.textPrimary }}>
                  Lembretes de DARF
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Alertas com dias de antecedência para recolhimento de DARFs devidos
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.darfReminders}
                onChange={(e) => updatePreferences({ darfReminders: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: colors.accent }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 500, color: colors.textPrimary }}>
                  Lembretes Fiscais e Apuração
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Avisos de inconsistências fiscais e apurações mensais pendentes
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.fiscalReminders}
                onChange={(e) => updatePreferences({ fiscalReminders: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: colors.accent }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 500, color: colors.textPrimary }}>
                  Evidências de Custo de Aquisição
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Notificar quando posições necessitarem de documentos de custo pré-baseline
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.costEvidenceAlerts}
                onChange={(e) => updatePreferences({ costEvidenceAlerts: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: colors.accent }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 500, color: colors.textPrimary }}>
                  Revisões de Conciliação
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Alertas consolidados sobre divergências em importações de notas/extratos
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.reconciliationAlerts}
                onChange={(e) => updatePreferences({ reconciliationAlerts: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: colors.accent }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 500, color: colors.textPrimary }}>
                  Alertas de notícias relevantes
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Notifica eventos críticos ou de alta relevância novos ou atualizados na carteira
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.materialNewsAlerts}
                onChange={(e) => updatePreferences({ materialNewsAlerts: e.target.checked })}
                aria-label="Alertas de notícias relevantes"
                style={{ width: 18, height: 18, accentColor: colors.accent }}
              />
            </label>
          </div>

          {/* Quiet Hours */}
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: spacing.sm }}>
              <div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  Horário de Silêncio (Quiet Hours)
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Suprime notificações não-urgentes durante o período de descanso
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!preferences.enabled}
                checked={preferences.quietHoursEnabled}
                onChange={(e) => updatePreferences({ quietHoursEnabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: colors.accent }}
              />
            </label>

            {preferences.quietHoursEnabled && (
              <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.sm }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
                    Início
                  </label>
                  <input
                    type="time"
                    disabled={!preferences.enabled}
                    value={preferences.quietHoursStart}
                    onChange={(e) => updatePreferences({ quietHoursStart: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: colors.surfaceHover,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      color: colors.textPrimary,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: colors.textSecondary, display: 'block', marginBottom: 4 }}>
                    Fim
                  </label>
                  <input
                    type="time"
                    disabled={!preferences.enabled}
                    value={preferences.quietHoursEnd}
                    onChange={(e) => updatePreferences({ quietHoursEnd: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: colors.surfaceHover,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      color: colors.textPrimary,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Test Harness Button (Dev Only) */}
          {Boolean(import.meta.env.DEV) && (
            <div
              style={{
                borderTop: `1px solid ${colors.border}`,
                paddingTop: spacing.md,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: spacing.sm,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: colors.textPrimary, fontSize: '0.875rem' }}>
                  Harness de Teste Local (DEV)
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Dispara notificação sintética de validação no sistema operacional
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                {testStatus && (
                  <span style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    {testStatus}
                  </span>
                )}
                <Button size="sm" variant="secondary" onClick={handleTestNotification}>
                  Enviar Teste
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
