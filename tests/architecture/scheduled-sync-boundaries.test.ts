import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/**
 * Phase 5P-A — scheduled sync foundation boundaries.
 *
 * The scheduler stays generic: pure planning in the import engine,
 * source-specific knowledge only inside registered executors, zero
 * financial math outside engines, and no live B3 transport in the
 * background path.
 */
describe('Phase 5P-A: scheduled sync architecture boundaries', () => {
  it('schedule and job planning modules are pure: no Nest/Prisma/database/timers', () => {
    for (const file of [
      'packages/import-engine/src/schedule.ts',
      'packages/import-engine/src/job.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/@nestjs/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/setInterval|setTimeout/);
      expect(content, file).not.toMatch(/Date\.now\(\)/);
      expect(content, file).not.toMatch(/new Date\(\s*\)/);
    }
  });

  it('background executor and worker never touch the ledger writer or live B3 transport', () => {
    for (const file of [
      'apps/api/src/application/imports/source-sync-executor.ts',
      'apps/api/src/application/imports/integration-worker.service.ts',
      'apps/api/src/application/imports/integration-scheduler.service.ts',
    ]) {
      const content = readSource(file);
      expect(content, file).not.toMatch(/CreateTransactionUseCase/);
      expect(content, file).not.toMatch(/@atlas\/b3-integration/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/@atlas\/tax-engine/);
      expect(content, file).not.toMatch(/parseFloat|Math\.pow/);
      expect(content, file).not.toMatch(/B3HttpClient|B3TokenCache|B3Cert|\.p12|\.pfx|privateKey/i);
    }
  });

  it('node-cron stays confined to scheduler adapters', () => {
    const schedulerFiles = [
      'apps/api/src/modules/imports/node-cron-integration.scheduler.ts',
      'apps/api/src/ingestion/scheduler/node-cron-ingestion.scheduler.ts',
    ];
    for (const file of schedulerFiles) {
      expect(fs.existsSync(path.join(rootDir, file)), file).toBe(true);
    }
    const guarded: string[] = [];
    function scan(dir: string): void {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (entry === 'node_modules') continue;
          scan(full);
        } else if (
          full.endsWith('.ts') &&
          !schedulerFiles.some((kept) => full.split(path.sep).join('/').endsWith(kept))
        ) {
          const content = fs.readFileSync(full, 'utf8');
          if (/from 'node-cron'|require\('node-cron'\)/.test(content)) {
            guarded.push(path.relative(rootDir, full));
          }
        }
      }
    }
    scan(path.join(rootDir, 'apps/api/src'));
    expect(guarded).toEqual([]);
  });

  it('scheduling policy and tokens never carry secrets or credentials', () => {
    const content = readSource('apps/api/src/application/imports/integration-scheduling.tokens.ts');
    expect(content).not.toMatch(
      /(api[_-]?key|client[_-]?secret|private[_-]?key|password\s*[:=]|certificate\s*[:=])/i,
    );
    expect(content).not.toMatch(/process\.env\.\w*(SECRET|TOKEN|KEY|CERT)\w*/);
  });
});
