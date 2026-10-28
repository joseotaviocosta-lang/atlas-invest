import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PROFILE_PAGE = 'apps/web/src/app/(app)/profile/page.tsx';
const PRIVACY_PAGE = 'apps/web/src/app/(app)/profile/privacy/page.tsx';

describe('Web: Privacy Center & Legal Readiness (Phase 6B)', () => {
  it('Profile page contains link to Central de Privacidade with accessible touch targets', () => {
    const profileSource = fs.readFileSync(path.resolve(process.cwd(), PROFILE_PAGE), 'utf-8');

    expect(profileSource).toContain('/profile/privacy');
    expect(profileSource).toContain('Central de Privacidade e LGPD');
    expect(profileSource).toContain("minHeight: '44px'");
  });

  it('Privacy page contains data export, consents, DSR workflow, sharing and deactivation', () => {
    const privacySource = fs.readFileSync(path.resolve(process.cwd(), PRIVACY_PAGE), 'utf-8');

    // 1. Data Export
    expect(privacySource).toContain('/api/v1/privacy/export');
    expect(privacySource).toContain('Exportação de Dados Pessoais e Financeiros');
    expect(privacySource).toContain('Exportar Meus Dados (JSON)');
    expect(privacySource).toContain('Senhas, hashes de tokens e segredos');

    // 2. Granular Consents
    expect(privacySource).toContain('/api/v1/privacy/consents');
    expect(privacySource).toContain('Gestão Granular de Consentimentos');
    expect(privacySource).toContain('AI_GROUNDED_EXPLANATIONS');
    expect(privacySource).toContain('PRODUCT_COMMUNICATIONS');
    expect(privacySource).toContain('ANALYTICS_TELEMETRY');
    expect(privacySource).toContain('INTEGRATION_AUTOMATION');

    // 3. Data Subject Requests
    expect(privacySource).toContain('/api/v1/privacy/requests');
    expect(privacySource).toContain('Exercício de Direitos do Titular');
    expect(privacySource).toContain('RETENÇÃO FISCAL / EM REVISÃO');

    // 4. Data Sharing Transparency
    expect(privacySource).toContain('/api/v1/privacy/sharing');
    expect(privacySource).toContain('Transparência de Compartilhamento e Operadores');

    // 5. Account Deactivation
    expect(privacySource).toContain('/api/v1/privacy/account/deactivate');
    expect(privacySource).toContain('DESATIVAR MINHA CONTA');
    expect(privacySource).toContain('Art. 16, I da LGPD');
    expect(privacySource).toContain('Código Tributário Nacional');

    // 6. Accessibility Touch Targets (>= 44px)
    expect(privacySource).toMatch(/minHeight: '44px'/);
  });
});

