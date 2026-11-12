import React, { useState } from 'react';
import { useNotifications } from '../NotificationProvider';
import {
  ALLOWED_NEWS_MONITORING_INTERVALS,
  normalizeNewsMonitoringIntervalMinutes,
} from '../news-monitoring';
import { Card, Button, Badge } from '../../../components/ui';
import { colors, spacing, borderRadius } from '@atlas/ui';

export const NotificationSettingsSection: React.FC = () => {
  const {
    permissionState,
    requestPermission,
    preferences,
    updatePreferences,
    sendTestNotification,
    closedAppMonitoring,
    repairClosedAppMonitoring,
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

            {/* Automatic In-App News Monitoring (APP-16P) */}
            <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                    Monitoramento automático de notícias
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                    O Atlas monitora automaticamente enquanto o aplicativo está aberto ou minimizado.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.automaticNewsMonitoring}
                  onChange={(e) => updatePreferences({ automaticNewsMonitoring: e.target.checked })}
                  aria-label="Monitoramento automático de notícias"
                  style={{ width: 18, height: 18, accentColor: colors.accent }}
                />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
                <label
                  htmlFor="news-monitoring-interval-select"
                  style={{ fontSize: '0.8125rem', color: colors.textSecondary }}
                >
                  Frequência
                </label>
                <select
                  id="news-monitoring-interval-select"
                  aria-label="Frequência"
                  disabled={!preferences.automaticNewsMonitoring && !preferences.closedAppNewsMonitoring}
                  value={preferences.newsMonitoringIntervalMinutes}
                  onChange={(e) =>
                    updatePreferences({
                      newsMonitoringIntervalMinutes: normalizeNewsMonitoringIntervalMinutes(
                        Number(e.target.value),
                      ),
                    })
                  }
                  style={{
                    padding: '6px 10px',
                    backgroundColor: colors.surfaceHover,
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    color: colors.textPrimary,
                    fontSize: '0.8125rem',
                  }}
                >
                  {ALLOWED_NEWS_MONITORING_INTERVALS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {`${minutes} min`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Closed-App Local Monitoring Opt-in (APP-16Q) */}
              <div style={{ marginTop: spacing.xs, paddingTop: spacing.sm, borderTop: `1px dashed ${colors.border}` }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                      Monitorar notícias com o Atlas fechado
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                      Quando ativado, o Windows executará verificações periódicas locais mesmo com o aplicativo fechado.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.closedAppNewsMonitoring}
                    onChange={(e) => updatePreferences({ closedAppNewsMonitoring: e.target.checked })}
                    aria-label="Monitorar notícias com o Atlas fechado"
                    style={{ width: 18, height: 18, accentColor: colors.accent }}
                  />
                </label>

                {(preferences.closedAppNewsMonitoring || closedAppMonitoring?.task.needsRepair || closedAppMonitoring?.lastExecution) && (
                  <div
                    style={{
                      marginTop: spacing.sm,
                      padding: spacing.sm,
                      backgroundColor: colors.surfaceHover,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      fontSize: '0.75rem',
                      color: colors.textSecondary,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                      {closedAppMonitoring?.lastExecution?.status === 'RUNTIME_VERSION_MISMATCH' ||
                      closedAppMonitoring?.task.runtimeHealthy === false
                        ? 'Monitoramento com Atlas fechado: Version mismatch'
                        : closedAppMonitoring?.task.needsRepair
                          ? 'Monitoramento com Atlas fechado: Needs repair'
                          : closedAppMonitoring?.task.installed && closedAppMonitoring?.task.enabled
                            ? 'Monitoramento com Atlas fechado: Healthy'
                            : preferences.closedAppNewsMonitoring
                              ? 'Monitoramento com Atlas fechado: Configurando...'
                              : 'Monitoramento com Atlas fechado: Inativo'}
                    </div>
                    {closedAppMonitoring?.lastExecution?.error &&
                      closedAppMonitoring.lastExecution.status !== 'SUCCESS' && (
                        <div style={{ color: colors.negative }}>
                          Última falha: {closedAppMonitoring.lastExecution.status}
                        </div>
                      )}
                    <div>
                      Última execução:{' '}
                      {closedAppMonitoring?.lastExecution?.lastRunAt
                        ? new Date(closedAppMonitoring.lastExecution.lastRunAt).toLocaleString('pt-BR')
                        : closedAppMonitoring?.task.lastRunAt
                          ? new Date(closedAppMonitoring.task.lastRunAt).toLocaleString('pt-BR')
                          : '—'}
                    </div>
                    <div>
                      Último resultado:{' '}
                      {closedAppMonitoring?.lastExecution
                        ? `${closedAppMonitoring.lastExecution.status} (${closedAppMonitoring.lastExecution.auditedAssets} ativos, ${closedAppMonitoring.lastExecution.eventsCount} eventos)`
                        : '—'}
                    </div>
                    <div>
                      Próxima execução:{' '}
                      {closedAppMonitoring?.task.nextRunAt
                        ? new Date(closedAppMonitoring.task.nextRunAt).toLocaleString('pt-BR')
                        : '—'}
                    </div>
                    {(closedAppMonitoring?.task.needsRepair ||
                      closedAppMonitoring?.task.runtimeHealthy === false) && (
                      <div style={{ marginTop: 4 }}>
                        <Button
                          variant="secondary"
                          onClick={() => void repairClosedAppMonitoring()}
                        >
                          Reparar monitoramento
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quiet Hours */}
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: spacing.md }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: spacing.sm }}>
              <div>
                <div style={{ fontWeight: 600, color: colors.textPrimary }}>
                  Horário de Silêncio (Quiet Hours)
                </div>
                <div style={{ fontSize: '0.8125rem', color: colors.textSecondary }}>
                  Durante o horário silencioso, o Atlas continua monitorando, mas não exibe alertas sonoros do sistema.
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
