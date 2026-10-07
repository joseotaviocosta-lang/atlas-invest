import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const COMPONENT = 'apps/web/src/components/fiscal/UnifiedAnnualSection.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/annual/[year]/page.tsx';

function readWeb(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Web: Unified Annual IRPF orchestration page (Phase 4J.1)', () => {
  it('page and component files exist and are wired together', () => {
    expect(fs.existsSync(path.join(process.cwd(), COMPONENT))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), PAGE))).toBe(true);
    expect(readWeb(PAGE)).toContain('UnifiedAnnualSection');
  });

  it('consumes the frozen unified annual endpoint only', () => {
    const c = readWeb(COMPONENT);
    expect(c).toContain('/api/v1/fiscal/annual/');
    // Must NOT read the raw ledger or duplicate 4H/4I detail endpoints.
    expect(c).not.toMatch(/\/transactions/);
    expect(c).not.toMatch(/\/high-income\/evidence/);
  });

  it('performs no client-side financial math', () => {
    const c = readWeb(COMPONENT);
    expect(c).not.toMatch(/from\s+['"]decimal\.js/);
    expect(c).not.toMatch(/parseFloat|Number\.parseFloat/);
    expect(c).not.toMatch(/\.div\(|\.times\(|\.multipliedBy\(|\.dividedBy\(/);
    expect(c).not.toMatch(/\/\s*total/i);
    expect(c).not.toMatch(/calculate\w+|compute\w+/i);
  });

  it('surfaces statuses/labels verbatim and does not mislabel cost as market value', () => {
    const c = readWeb(COMPONENT);
    expect(c).toContain('READY_FOR_REVIEW');
    expect(c).toContain('Pronto para revisão');
    // Review-ready is NOT filed/paid; the component says so explicitly.
    expect(c).toContain('não significa enviado nem pago');
    // Must not mislabel cost as patrimônio/market value.
    expect(c).not.toMatch(/valor de mercado|patrim[ôo]nio atual/i);
  });

  it('renders the five visual states and makes BLOCKING issues highly visible', () => {
    const c = readWeb(COMPONENT);
    expect(c).toContain('unified-annual-loading');
    expect(c).toContain('ErrorState');
    expect(c).toContain('EmptyState');
    expect(c).toContain('unified-annual-blocking-issues');
    expect(c).toContain('role="alert"');
  });

  it('is accessible: status not color-only (badge + text), 44px targets, deep links', () => {
    const c = readWeb(COMPONENT);
    expect(c).toContain('role="status"');
    expect(c).toContain("minHeight: '44px'");
    expect(c).toContain('Ver detalhe →');
  });

  it('fails safe on a malformed response', () => {
    const c = readWeb(COMPONENT);
    expect(c).toContain('isValidWire');
    expect(c).toContain('Resposta inválida do servidor');
  });

  it('introduces no new @atlas/ui unified export (consumes local wire types only)', () => {
    const c = readWeb(COMPONENT);
    expect(c).not.toMatch(/formatUnifiedAnnual|unifiedAnnualViewModel|unifiedAnnualQueryKey/);
  });
});
