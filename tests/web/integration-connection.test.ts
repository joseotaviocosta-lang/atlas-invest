import { describe, expect, it } from 'vitest';
import {
  describeIntegrationConnection,
  describeIntegrationConnectionState,
  describeIntegrationStatus,
} from '@atlas/ui';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5P-D (web) — connection lifecycle UX.
 *
 * The settings surface shows the persisted connection (never an implicit
 * authorization) with one primary action per state, distinct revoked copy
 * with a data-retention guarantee, and no production connect path while B3
 * is PREPARING.
 */
describe('Phase 5P-D (web): connection lifecycle UX', () => {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/app/(app)/portfolio/import/page.tsx'),
    'utf8',
  );
  // Strip line comments: several explain what is deliberately absent.
  const page = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('maps every connection state to copy, tone and a single primary action', () => {
    expect(describeIntegrationConnectionState('NOT_CONNECTED')).toMatchObject({
      label: 'Não conectado',
      primaryAction: 'CONNECT',
    });
    expect(describeIntegrationConnectionState('AWAITING_AUTHORIZATION')).toMatchObject({
      label: 'Aguardando autorização',
      tone: 'info',
      primaryAction: 'CONTINUE_AUTHORIZATION',
    });
    expect(describeIntegrationConnectionState('AUTHORIZED')).toMatchObject({
      primaryAction: null,
    });
    expect(describeIntegrationConnectionState('NEEDS_REAUTH')).toMatchObject({
      label: 'Nova autorização necessária',
      tone: 'warning',
      primaryAction: 'RECONNECT',
    });
    expect(describeIntegrationConnectionState('NOPE').label).toBe('Conexão desconhecida');
    expect(describeIntegrationConnection('AWAITING_AUTHORIZATION')).toBe('Aguardando autorização');
    expect(describeIntegrationStatus('AWAITING_AUTHORIZATION').label).toBe(
      'Aguardando autorização',
    );
  });

  it('renders the connection card with state, timestamps and actions', () => {
    expect(page).toContain('Conexão B3');
    expect(page).toContain('Autorizada em');
    expect(page).toContain('integrations/B3/');
    expect(page).toContain("'authorize'");
    expect(page).toContain("'complete-authorization'");
    expect(page).toContain("'revoke'");
    expect(page).toContain('Conectar');
    expect(page).toContain('Continuar autorização');
    expect(page).toContain('Autorizar novamente');
    expect(page).toContain('Desconectar');
  });

  it('shows distinct revoked copy with a data-retention guarantee', () => {
    expect(page).toContain('Acesso revogado');
    expect(page).toContain(
      'Seus dados já importados e o histórico permanecem no Atlas. Novas sincronizações param até nova autorização.',
    );
  });

  it('never offers a production connect path and never touches secrets', () => {
    expect(page).not.toMatch(/CERT|certificado|mTLS|client_secret|OAuth/i);
    expect(page).not.toMatch(/apiClient\.post\([^)]*authorize[^)]*(CERT|PROD)/);
    expect(page).toContain('aria-label="Conectar fonte B3 (simulação)"');
    expect(page).toContain('aria-label="Continuar autorização da fonte B3"');
    expect(page).toContain('aria-label="Autorizar novamente a fonte B3"');
    expect(page).toContain('aria-label="Desconectar fonte B3"');
    expect(page).not.toMatch(/parseFloat|Math\.pow|Math\.sqrt/);
  });
});
