import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.join(process.cwd(), 'packages', 'tax-engine', 'src');

const FORBIDDEN_IMPORT_SUBSTRINGS = [
  '@prisma/client',
  '@atlas/database',
  '@atlas/ai-engine',
  '@atlas/market-data',
  '@atlas/news-data',
  '@atlas/ui',
  'react',
  'react-native',
  'next',
  '@nestjs',
  'openai',
  'axios',
  'node-fetch',
  'node:http',
  'node:https',
  'node:net',
  'node:dgram',
];

const ALLOWED_ATLAS_PACKAGES = ['@atlas/domain'];

function readSourceFiles(): Array<{ file: string; content: string }> {
  return fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, content: fs.readFileSync(path.join(SRC_DIR, f), 'utf8') }));
}

describe('Phase 4A — Tax Engine architecture boundaries', () => {
  const files = readSourceFiles();

  it('has real source files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('imports no Prisma / AI / UI / framework / network / provider SDK', () => {
    for (const { file, content } of files) {
      const importLines = content
        .split('\n')
        .filter((l) => /^\s*import\b/.test(l) || /from\s+['"]/.test(l));
      for (const line of importLines) {
        for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
          expect(
            line.includes(`'${forbidden}'`) || line.includes(`"${forbidden}"`),
            `${file} must not import '${forbidden}': ${line.trim()}`,
          ).toBe(false);
        }
      }
    }
  });

  it('only depends on the pure domain package among Atlas packages', () => {
    for (const { file, content } of files) {
      const matches = content.match(/from\s+['"](@atlas\/[a-z-]+)['"]/g) ?? [];
      for (const match of matches) {
        const pkg = match.replace(/from\s+['"]/, '').replace(/['"]$/, '');
        expect(ALLOWED_ATLAS_PACKAGES, `${file} imports ${pkg}`).toContain(pkg);
      }
    }
  });

  it('contains no browser/global network calls', () => {
    for (const { file, content } of files) {
      expect(/\bfetch\s*\(/.test(content), `${file} must not call fetch()`).toBe(false);
      expect(/\bXMLHttpRequest\b/.test(content), `${file} must not use XMLHttpRequest`).toBe(false);
    }
  });
});
