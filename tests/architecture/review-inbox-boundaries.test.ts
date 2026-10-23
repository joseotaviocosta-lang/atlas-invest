import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5P-B — review inbox architecture boundaries.
 *
 * The inbox is derived, in-app and transport-free: pure derivation in the
 * import engine, read-only API projection, no new tables, no external
 * notification dependencies, no financial math outside engines.
 */
describe('Phase 5P-B: review inbox architecture boundaries', () => {
  it('inbox derivation is pure: no Nest/Prisma/database/tax/UI/network/clock', () => {
    const content = readSource('packages/import-engine/src/review-inbox.ts');
    expect(content).not.toMatch(/@nestjs/);
    expect(content).not.toMatch(/@prisma\/client/);
    expect(content).not.toMatch(/@atlas\/database/);
    expect(content).not.toMatch(/@atlas\/tax-engine/);
    expect(content).not.toMatch(/@atlas\/ui/);
    expect(content).not.toMatch(/setInterval|setTimeout/);
    expect(content).not.toMatch(/Date\.now\(\)/);
    expect(content).not.toMatch(/new Date\(\s*\)/);
    expect(content).not.toMatch(/fetch\(|axios|nodemailer|sendgrid/i);
  });

  it('review service and controller never touch ledger writers, live B3 or fiscal engines', () => {
    for (const file of [
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/api/src/modules/reviews/integration-reviews.controller.ts',
      'apps/api/src/modules/reviews/integration-review.mapper.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/@atlas\/ui/);
      expect(content, file).not.toMatch(/parseFloat|Math\.pow/);
      expect(content, file).not.toMatch(/row\.fingerprint|row\.externalId/);
      expect(content, file).not.toMatch(/fingerprint:|externalId:/);
    }
  });

  it('no external notification transport enters the API', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'apps/api/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const forbidden of [
      'nodemailer',
      '@nestjs-modules/mailer',
      '@nestjs/bull',
      'bullmq',
      'firebase-admin',
      'twilio',
      'whatsapp',
    ]) {
      expect(deps, forbidden).not.toContain(forbidden);
    }
    for (const file of [
      'apps/api/src/application/imports/integration-review.service.ts',
      'apps/api/src/modules/reviews/integration-reviews.controller.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/smtp|sendmail|push-notification|webhook/i);
    }
  });

  it('no inbox/review/notification tables enter the schema', () => {
    const schema = readSource('packages/database/prisma/schema.prisma');
    expect(schema).not.toMatch(/model\s+(IntegrationReview|ReviewItem|InboxItem)\b/);
    const migrationsDir = path.join(rootDir, 'packages/database/prisma/migrations');
    for (const entry of fs.readdirSync(migrationsDir)) {
      if (entry === 'migration_lock.toml') continue;
      const sql = fs.readFileSync(path.join(migrationsDir, entry, 'migration.sql'), 'utf8');
      expect(sql, entry).not.toMatch(
        /CREATE TABLE\s+"(integration_reviews|review_items|inbox_items)"/,
      );
    }
  });

  it('review API stays inside the imports/reviews modules and reuses ownership guards', () => {
    const controller = readSource('apps/api/src/modules/reviews/integration-reviews.controller.ts');
    expect(controller).toContain('CurrentPrincipal');
    expect(controller).toContain('UUIDParamPipe');
    expect(controller).toContain('ZodValidationPipe');
    const service = readSource('apps/api/src/application/imports/integration-review.service.ts');
    expect(service).toContain('EntityNotFoundError');
  });
});
