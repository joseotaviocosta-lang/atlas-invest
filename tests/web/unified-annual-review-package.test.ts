import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  isPackageStale,
  isValidReviewPackage,
  reviewPackageFallbackFilename,
  reviewPackageFilenameFromContentDisposition,
  reviewPackageFingerprintOf,
  unifiedAnnualReviewPackageQueryKey,
} from '@/components/fiscal/unified-annual-wire';

const COMPONENT = 'apps/web/src/components/fiscal/UnifiedAnnualSection.tsx';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Web: Unified Annual review-package export (Phase 4J.2)', () => {
  it('review-package query key is namespaced and year-scoped', () => {
    expect(unifiedAnnualReviewPackageQueryKey(2026)).toEqual([
      'unified-annual-review-package',
      '2026',
    ]);
    expect(unifiedAnnualReviewPackageQueryKey(2026)).not.toEqual(
      unifiedAnnualReviewPackageQueryKey(2027),
    );
  });

  it('light package guard accepts valid envelopes and rejects malformed ones', () => {
    const valid = {
      packageVersion: 'unified-annual-review-package-v1',
      status: 'READY_FOR_REVIEW',
      packageFingerprint: 'f'.repeat(64),
      sectionGProvenance: { annualFingerprint: 'a'.repeat(64) },
    };
    expect(isValidReviewPackage(valid)).toBe(true);
    expect(reviewPackageFingerprintOf(valid)).toBe('f'.repeat(64));
    expect(isValidReviewPackage(null)).toBe(false);
    expect(isValidReviewPackage({})).toBe(false);
    expect(isValidReviewPackage({ ...valid, sectionGProvenance: {} })).toBe(false);
    expect(reviewPackageFingerprintOf({})).toBe(null);
  });

  it('fallback filename is year-only with no PII; header parsing prefers the server name', () => {
    expect(reviewPackageFallbackFilename(2026, 'csv')).toBe('atlas-irpf-2026-relatorio-apoio.csv');
    expect(reviewPackageFallbackFilename(2026, 'json')).toBe(
      'atlas-irpf-2026-relatorio-apoio.json',
    );
    expect(
      reviewPackageFilenameFromContentDisposition(
        'attachment; filename="atlas-irpf-2026-relatorio-apoio.csv"',
        'fallback.csv',
      ),
    ).toBe('atlas-irpf-2026-relatorio-apoio.csv');
    expect(reviewPackageFilenameFromContentDisposition(null, 'fallback.csv')).toBe('fallback.csv');
    expect(reviewPackageFilenameFromContentDisposition('attachment', 'fallback.csv')).toBe(
      'fallback.csv',
    );
  });

  it('staleness is a pure fingerprint comparison (no persistence)', () => {
    expect(isPackageStale(null, 'a'.repeat(64))).toBe(false);
    expect(isPackageStale('a'.repeat(64), null)).toBe(false);
    expect(isPackageStale('a'.repeat(64), 'a'.repeat(64))).toBe(false);
    expect(isPackageStale('a'.repeat(64), 'b'.repeat(64))).toBe(true);
  });

  it('component exposes a support-only export action with fail-safe and stale UX', () => {
    const c = readWeb(COMPONENT);
    expect(c).toContain('/review-package');
    expect(c).toContain('/review-package/export');
    expect(c).toContain('Exportar relatório anual de apoio');
    expect(c).toContain('não é arquivo oficial da Receita Federal');
    expect(c).toContain('unified-annual-export-button');
    expect(c).toContain('unified-annual-export-format');
    expect(c).toContain('unified-annual-package-stale');
    // Fail-safe: malformed package disables the download.
    expect(c).toContain('unified-annual-export-unavailable');
    // No tax math client-side: no float parsing of financial values, no engine import.
    expect(c).not.toMatch(/parseFloat/);
    expect(c).not.toMatch(/@atlas\/tax-engine/);
    // Download filename falls back to the year-only convention (built in the wire).
    expect(c).toContain('reviewPackageFallbackFilename');
    expect(readWeb('apps/web/src/components/fiscal/unified-annual-wire.ts')).toContain(
      'atlas-irpf-',
    );
    // Focus-safe trigger + keyboard-native controls (button/select).
    expect(c).toContain('exportButtonRef');
  });
});
