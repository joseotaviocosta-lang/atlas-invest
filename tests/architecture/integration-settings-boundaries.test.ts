import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5P-C — integration settings architecture boundaries.
 * Phase 5P-D — the settings surface keeps its read model, plus exactly
 * four POST connection actions (strict empty bodies, server-owned fields).
 *
 * Settings are a derived read model over existing rows: pure availability
 * and status in the engine, an aggregating service, no new
 * tables, no notification transport, no B3 transport in the presentation
 * path, and no scheduler internals leaking into UI.
 */
describe('Phase 5P-C: integration settings architecture boundaries', () => {
  it('availability and status modules are pure: no Nest/Prisma/database/UI/network/clock', () => {
    for (const file of [
      'packages/import-engine/src/integration-availability.ts',
      'packages/import-engine/src/integration-status.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@nestjs/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/setInterval|setTimeout/);
      expect(content, file).not.toMatch(/Date\.now\(\)/);
      expect(content, file).not.toMatch(/new Date\(\s*\)/);
      expect(content, file).not.toMatch(/fetch\(|axios/i);
      expect(content, file).not.toMatch(/process\.env/);
    }
  });

  it('settings service never touches ledger writers, live B3 or fiscal engines', () => {
    for (const file of [
      'apps/api/src/application/imports/integration-settings.service.ts',
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
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache|B3Cert|\.p12|\.pfx|privateKey/i);
    }
  });

  it('web settings surface never imports scheduler internals or B3 transport', () => {
    const page = readSource('apps/web/src/app/(app)/portfolio/import/page.tsx');
    expect(page).not.toMatch(/node-cron/);
    expect(page).not.toMatch(/claimDue|markSucceeded/);
    expect(page).not.toMatch(/B3HttpClient|B3TokenCache/);
    expect(page).not.toMatch(/@atlas\/b3-integration/);
    expect(page).toContain('portfolio-integrations');
  });

  it('settings view-model stays presentation-only', () => {
    const content = readSource('packages/ui/src/view-models/integration-settings.view-model.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/fetch\(|axios/);
    expect(content).not.toMatch(/parseFloat|Math\.pow/);
  });

  it('no settings/persistence tables enter the schema', () => {
    const schema = readSource('packages/database/prisma/schema.prisma');
    expect(schema).not.toMatch(/model\s+(IntegrationSetting|IntegrationAvailability)\b/);
  });

  it('settings API stays ownership-guarded; writes are connection actions only', () => {
    const controller = readSource(
      'apps/api/src/modules/integrations/integration-settings.controller.ts',
    );
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    // Phase 5P-D adds exactly four POST connection actions (no PATCH/PUT/DELETE).
    // Every one validates against the strict empty DTO: no client-controlled fields.
    const posts = controller.match(/@Post\(/g);
    expect(posts).toHaveLength(4);
    expect(controller).not.toMatch(/@Patch|@Delete|@Put/);
    expect(controller).toMatch(/IntegrationConnectionActionBodySchema/g);
    const service = readSource('apps/api/src/application/imports/integration-settings.service.ts');
    expect(service).toContain('EntityNotFoundError');
    expect(service).not.toMatch(/\.create\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
