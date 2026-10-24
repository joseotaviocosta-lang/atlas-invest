import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5P-D — connection lifecycle architecture boundaries.
 *
 * The lifecycle is a persisted, server-owned concept: pure transitions in
 * the engine, one guarded service, no secrets anywhere, no scheduler
 * internals or B3 transport leaking into the UI, and connection state that
 * never flows to presentation unmapped.
 */
describe('Phase 5P-D: integration connection architecture boundaries', () => {
  it('connection transitions and eligibility are pure: no Nest/Prisma/database/UI/network/clock', () => {
    const content = readSource('packages/import-engine/src/integration-connection.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/tax-engine/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/setInterval|setTimeout/);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/process\.env/);
  });

  it('connection service and controller never touch ledger writers, live B3 or fiscal engines', () => {
    for (const file of [
      'apps/api/src/application/imports/integration-connection.service.ts',
      'apps/api/src/modules/integrations/integration-settings.controller.ts',
      'apps/api/src/modules/integrations/integration-settings.mapper.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/parseFloat|Math\.pow/);
      expect(content, file).not.toMatch(/fingerprint|externalId/);
    }
  });

  it('connection actions accept no client-controlled fields', () => {
    const dto = readSource('apps/api/src/modules/integrations/dto/integration-connection.dto.ts');
    expect(dto).toContain('.strict()');
    expect(dto).toContain('z.object({})');
    const controller = readSource(
      'apps/api/src/modules/integrations/integration-settings.controller.ts',
    );
    // All four action bodies validate against the strict empty DTO…
    const strictBodies = controller.match(
      /new ZodValidationPipe\(IntegrationConnectionActionBodySchema\)/g,
    );
    expect(strictBodies).toHaveLength(4);
    // …and no handler declares server-owned or secret fields.
    expect(controller).not.toMatch(
      /(provider|environment|redirectUrl|token|secret|certificate)\s*[:?]/,
    );
  });

  it('web settings surface never imports scheduler internals, DB repos or B3 transport', () => {
    const raw = readSource('apps/web/src/app/(app)/portfolio/import/page.tsx');
    // Strip line comments: several explain what is deliberately absent.
    const page = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(page).not.toMatch(/node-cron/);
    expect(page).not.toMatch(/claimDue|markSucceeded|markCancelled/);
    expect(page).not.toMatch(/B3HttpClient|B3TokenCache/);
    expect(page).not.toMatch(/@atlas\/b3-integration/);
    expect(page).not.toMatch(/@atlas\/database/);
    expect(page).not.toMatch(/CERT|PROD/);
  });

  it('scheduler and worker consult connection eligibility instead of executing blindly', () => {
    const scheduler = readSource(
      'apps/api/src/application/imports/integration-scheduler.service.ts',
    );
    expect(scheduler).toContain('IntegrationConnectionService');
    expect(scheduler).toContain('isEligible');
    const worker = readSource('apps/api/src/application/imports/integration-worker.service.ts');
    expect(worker).toContain('IntegrationConnectionService');
    expect(worker).toContain('isEligible');
    expect(worker).toContain('markCancelled');
  });

  it('no notification transport enters the connection path', () => {
    for (const file of [
      'apps/api/src/application/imports/integration-connection.service.ts',
      'apps/api/src/modules/integrations/integration-settings.controller.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/smtp|sendmail|push-notification|webhook/i);
    }
  });

  it('raw persisted connection values never flow to presentation unmapped', () => {
    const service = readSource('apps/api/src/application/imports/integration-settings.service.ts');
    expect(service).toContain('toConnectionState');
    expect(service).not.toMatch(/connection:\s*\{\s*state:\s*connectionRow/);
  });
});
