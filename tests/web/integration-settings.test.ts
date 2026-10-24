import { describe, expect, it } from 'vitest';
import {
  describeIntegrationAvailability,
  describeIntegrationConnection,
  describeIntegrationStatus,
  describeIntegrationTimezone,
} from '@atlas/ui';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5P-C — integration settings UX (shared presentation + web surface).
 *
 * Settings show derived operational facts: availability, connection, status,
 * schedule intent, execution outcome and counts. Status is always
 * text-labeled, never color-only. No secrets, no payloads, no financial math
 * in copy helpers.
 */
describe('Phase 5P-C: integration settings UX', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
    'utf8',
  );

  it('maps every status to human copy with tone (never color-only)', () => {
    const statuses = [
      'PREPARING',
      'UNAVAILABLE',
      'NEEDS_REAUTH',
      'AWAITING_AUTHORIZATION',
      'SYNCING',
      'SYNC_ERROR',
      'SYNC_PARTIAL',
      'PENDING_REVIEW',
      'NOT_CONNECTED',
      'SCHEDULED_ACTIVE',
      'SCHEDULED_PAUSED',
      'READY',
    ];
    for (const status of statuses) {
      const presentation = describeIntegrationStatus(status);
      expect(presentation.label.trim().length).toBeGreaterThan(0);
      expect(presentation.description.trim().length).toBeGreaterThan(0);
      expect(['neutral', 'info', 'success', 'warning', 'danger']).toContain(presentation.tone);
    }
    expect(describeIntegrationStatus('PREPARING')).toMatchObject({ label: 'Em preparação' });
    expect(describeIntegrationStatus('SCHEDULED_ACTIVE')).toMatchObject({
      label: 'Sincronização automática ativa',
      tone: 'success',
    });
    expect(describeIntegrationStatus('SYNC_ERROR')).toMatchObject({ tone: 'danger' });
    expect(describeIntegrationStatus('NOPE').label).toBe('Estado desconhecido');
  });

  it('labels availability, connection and timezone in human pt-BR', () => {
    expect(describeIntegrationAvailability('PREPARING')).toBe('Em preparação');
    expect(describeIntegrationAvailability('AVAILABLE')).toBe('Disponível');
    expect(describeIntegrationAvailability('UNAVAILABLE')).toBe('Indisponível');
    expect(describeIntegrationConnection('AUTHORIZED')).toContain('Conectada');
    expect(describeIntegrationConnection('NEEDS_REAUTH')).toContain('Autorização');
    expect(describeIntegrationConnection('NOT_CONNECTED')).toBe('Não conectada');
    expect(describeIntegrationTimezone('America/Sao_Paulo')).toBe('Horário de Brasília');
    expect(describeIntegrationTimezone('America/New_York')).toBe('America/New_York');
  });

  it('renders the settings section with status, availability and connection', () => {
    expect(page).toContain('Sincronização automática');
    expect(page).toContain('portfolio-integrations');
    expect(page).toContain('/integrations');
    expect(page).toContain('Em preparação');
    expect(page).toContain('Disponível quando a integração B3 for ativada.');
  });

  it('shows no active production toggle for B3 PREPARING', () => {
    expect(page).toContain('schedulesAvailable');
    // Enable/disable buttons are gated by server capability flags, never
    // rendered unconditionally for a PREPARING source.
    expect(page).toContain('canEnable');
    expect(page).toContain('canDisable');
    expect(page).toContain('canEditSchedule');
  });

  it('covers cadence labels without market-calendar claims', () => {
    expect(page).toContain('Somente manual');
    expect(page).toContain('Diária');
    expect(page).toContain('Dias úteis');
    expect(page).not.toMatch(/pregão/i);
  });

  it('shows schedule status, next run, last run and last success', () => {
    expect(page).toContain('Última sincronização');
    expect(page).toContain('Última sincronização concluída');
    expect(page).toContain('Última sincronização falhou');
    expect(page).toContain('Sincronização parcial');
    expect(page).toContain('alguns dados não puderam ser obtidos');
    expect(page).toContain('describeScheduleNextRun');
  });

  it('links pending review and history instead of duplicating lists', () => {
    expect(page).toContain('Revisar agora');
    expect(page).toContain('/reviews?portfolioId=');
    expect(page).toContain('Ver histórico');
    expect(page).toContain('import-history');
    expect(page).toContain('Ver detalhes');
  });

  it('covers disabled, active, partial and failed states', () => {
    expect(page).toContain('Pausada');
    expect(page).toContain('Ativa');
    expect(page).toContain('Desativar sincronização automática?');
    expect(page).toContain('Suas operações e histórico não serão apagados.');
    expect(page).toContain('Salvando…');
    expect(page).toContain('Ajustes salvos.');
  });

  it('declares accessible labels and announced save states', () => {
    expect(page).toContain('aria-label="Frequência da sincronização"');
    expect(page).toContain('aria-label="Editar frequência da sincronização"');
    expect(page).toContain('aria-label="Editar hora local"');
    expect(page).toContain('aria-label="Editar minuto local"');
    expect(page).toContain('aria-label="Ativar sincronização automática"');
    expect(page).toContain('aria-label="Pausar sincronização automática"');
    expect(page).toContain('role="alert"');
    expect(page).toContain('role="status"');
    expect(page).toContain('aria-pressed');
  });

  it('uses a mobile-safe structure with touch targets and wrapping rows', () => {
    expect(page).toContain('minHeight: 44');
    expect(page).toContain('flexWrap');
  });

  it('keeps schedule creation server-driven with safe error copy', () => {
    expect(page).toContain('/imports/schedules');
    expect(page).toContain('Agendar sincronização');
    expect(page).toContain('Nova sincronização disponível');
    expect(page).toContain('Não foi possível concluir a operação');
    expect(page).not.toMatch(/parseFloat|Math\.pow|Math\.sqrt/);
    expect(page).not.toMatch(/importado automaticamente/i);
  });
});
