import { describe, expect, it } from 'vitest';
import {
  describeIntegrationAvailability,
  describeIntegrationConnection,
  describeIntegrationConnectionState,
  describeIntegrationStatus,
  describeIntegrationTimezone,
} from '@atlas/ui';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5P-C (mobile) — settings contracts stay compatible with the
 * read-only native app. The mobile app has no import hub: review and
 * confirmation stay on web, and the reviews screen says so instead of
 * offering a dead-end CTA. Settings presentation helpers must therefore
 * render without web-only dependencies.
 */
describe('Phase 5P-C (mobile): settings contract compatibility', () => {
  it('status, availability, connection and timezone copy resolve natively', () => {
    expect(describeIntegrationStatus('PREPARING').label).toBe('Em preparação');
    expect(describeIntegrationStatus('AWAITING_AUTHORIZATION').label).toBe(
      'Aguardando autorização',
    );
    expect(describeIntegrationStatus('PENDING_REVIEW').tone).toBe('warning');
    expect(describeIntegrationAvailability('AVAILABLE')).toBe('Disponível');
    expect(describeIntegrationConnection('AUTHORIZED').length).toBeGreaterThan(0);
    expect(describeIntegrationConnection('AWAITING_AUTHORIZATION')).toBe('Aguardando autorização');
    expect(describeIntegrationConnectionState('REVOKED' as never).label).toBe(
      'Conexão desconhecida',
    );
    expect(describeIntegrationConnectionState('NOT_CONNECTED').primaryAction).toBe('CONNECT');
    expect(describeIntegrationTimezone('America/Sao_Paulo')).toBe('Horário de Brasília');
  });

  it('native reviews screen stays read-only and defers to web', () => {
    const screen = fs.readFileSync(
      path.join(process.cwd(), 'apps/mobile/app/(app)/reviews.tsx'),
      'utf8',
    );
    expect(screen).toContain('Para revisar e importar, acesse a versão web do Atlas.');
    expect(screen).not.toMatch(/apiClient\.post|apiClient\.patch/);
    expect(screen).not.toMatch(/imports\/schedules/);
  });
});
