import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 5N — B3 connection boundary: clients render the product contract
 * from `@atlas/ui` and must never link the simulated source (or the import
 * engine internals) into production bundles. The simulated provider stays
 * test/dev infrastructure; no B3 runtime route may appear unnoticed.
 */
describe('Architecture Gate: B3 connection client boundary (Phase 5N)', () => {
  const rootDir = path.resolve(__dirname, '../..');

  function listSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listSourceFiles(full));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
    return files;
  }

  it('web and mobile production sources never import the simulated B3 provider', () => {
    for (const appDir of ['apps/web/src', 'apps/mobile/src', 'apps/mobile/app']) {
      for (const file of listSourceFiles(path.join(rootDir, appDir))) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content, file).not.toMatch(/b3-simulated/);
        expect(content, file).not.toMatch(/SimulatedB3Provider/);
        expect(content, file).not.toMatch(/runSimulatedB3Sync/);
      }
    }
  });

  it('web and mobile production sources never depend on B3 transport internals', () => {
    for (const appDir of ['apps/web/src', 'apps/mobile/src', 'apps/mobile/app']) {
      for (const file of listSourceFiles(path.join(rootDir, appDir))) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content, file).not.toMatch(/@atlas\/b3-integration/);
        expect(content, file).not.toMatch(/B3HttpProvider/);
        expect(content, file).not.toMatch(/B3HttpClient/);
      }
    }
  });

  it('B3 transport package stays server-side: dependency and import boundaries', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'packages/b3-integration/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    for (const forbidden of [
      '@atlas/ui',
      '@atlas/web',
      '@atlas/mobile',
      '@atlas/database',
      '@prisma/client',
      'react',
      'react-native',
      'expo',
      'next',
    ]) {
      expect(pkg.dependencies ?? {}).not.toHaveProperty(forbidden);
    }
    const sources = listSourceFiles(path.join(rootDir, 'packages/b3-integration/src'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, file).not.toMatch(/@atlas\/database/);
      expect(content, file).not.toMatch(/@prisma\/client/);
      expect(content, file).not.toMatch(/from ['"]@nestjs\//);
      expect(content, file).not.toMatch(/b3-simulated/);
      expect(content, file).not.toMatch(/globalThis\.fetch|[^.]fetch\(/);
    }
  });

  it('web and mobile production sources never depend on @atlas/import-engine', () => {
    for (const appDir of ['apps/web/src', 'apps/mobile/src', 'apps/mobile/app']) {
      for (const file of listSourceFiles(path.join(rootDir, appDir))) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toMatch(/@atlas\/import-engine/);
      }
    }
  });

  it('no B3 runtime route exists in the web or mobile app routers', () => {
    for (const file of [
      ...listSourceFiles(path.join(rootDir, 'apps/web/src/app')),
      ...listSourceFiles(path.join(rootDir, 'apps/mobile/app')),
    ]) {
      const normalized = file.replace(/\\/g, '/').toLowerCase();
      expect(normalized).not.toMatch(/b3[-_](connect|sync|callback|oauth|auth)/);
    }
  });

  it('the B3 presentation contract stays dependency-free inside @atlas/ui', () => {
    const source: string = fs.readFileSync(
      path.join(rootDir, 'packages/ui/src/view-models/b3-connection.view-model.ts'),
      'utf8',
    );
    const fromLines = source.split('\n').filter((line) => line.includes("from '"));
    expect(fromLines).toEqual([]);
  });
});
