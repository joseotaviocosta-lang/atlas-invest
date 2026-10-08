import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  isValidWire,
  parseStrictCalendarYear,
  type UnifiedAnnualWire,
} from '@/components/fiscal/unified-annual-wire';

const COMPONENT = 'apps/web/src/components/fiscal/UnifiedAnnualSection.tsx';
const PAGE = 'apps/web/src/app/(app)/tax/annual/[year]/page.tsx';

function validWire(): UnifiedAnnualWire {
  return {
    calendarYear: 2026,
    declarationExercise: 2027,
    status: 'READY_FOR_REVIEW',
    summary: {
      moduleCount: 5,
      readyCount: 5,
      actionRequiredCount: 0,
      blockedCount: 0,
      consistencyIssueCount: 0,
      blockingIssueCount: 0,
    },
    modules: [
      {
        module: 'ANNUAL_POSITIONS',
        source: '4H.2',
        status: 'READY',
        authoritative: true,
        blockingReasons: [],
        requirements: [],
        sourceFingerprint: 'fp',
        calculationFingerprint: null,
      },
    ],
    requirements: [],
    consistencyIssues: [],
    sourceFingerprint: 'sfp',
    annualFingerprint: 'afp',
  };
}

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

describe('Web: unified annual strict wire validation (fail-safe)', () => {
  it('accepts a well-formed response', () => {
    expect(isValidWire(validWire())).toBe(true);
  });

  it('rejects a null / non-object response', () => {
    expect(isValidWire(null)).toBe(false);
    expect(isValidWire(undefined)).toBe(false);
    expect(isValidWire('nope')).toBe(false);
    expect(isValidWire(42)).toBe(false);
  });

  it('rejects a response missing summary (would otherwise crash during render)', () => {
    const bad = { ...validWire() } as Record<string, unknown>;
    delete bad.summary;
    expect(isValidWire(bad)).toBe(false);
  });

  it('rejects a response with a malformed summary (non-numeric counts)', () => {
    const bad = { ...validWire(), summary: { moduleCount: 'five' } };
    expect(isValidWire(bad)).toBe(false);
  });

  it('rejects a response with a malformed module entry', () => {
    const bad = { ...validWire(), modules: [{ module: 'ANNUAL_POSITIONS' }] };
    expect(isValidWire(bad)).toBe(false);
  });

  it('rejects a response with a malformed requirement entry', () => {
    const bad = { ...validWire(), requirements: [{ key: 123 }] };
    expect(isValidWire(bad)).toBe(false);
  });

  it('rejects a response with a malformed consistency issue entry', () => {
    const bad = { ...validWire(), consistencyIssues: [{ code: 'X', severity: 'BLOCKING' }] };
    expect(isValidWire(bad)).toBe(false);
  });

  it('rejects a module whose nested requirement is malformed', () => {
    const wire = validWire();
    const bad = {
      ...wire,
      modules: [{ ...wire.modules[0]!, requirements: [{ key: 'k' }] }],
    };
    expect(isValidWire(bad)).toBe(false);
  });
});

describe('Web: strict route year parsing (preserves invalidity, no silent coercion)', () => {
  it('accepts a canonical in-range year', () => {
    expect(parseStrictCalendarYear('2026')).toBe(2026);
  });

  it('rejects trailing junk (never silently coerces 2026junk -> 2026)', () => {
    expect(parseStrictCalendarYear('2026junk')).toBeNull();
  });

  it('rejects leading zeros, whitespace, decimals and empty input', () => {
    expect(parseStrictCalendarYear('02026')).toBeNull();
    expect(parseStrictCalendarYear(' 2026 ')).toBeNull();
    expect(parseStrictCalendarYear('2026.0')).toBeNull();
    expect(parseStrictCalendarYear('')).toBeNull();
    expect(parseStrictCalendarYear('abc')).toBeNull();
  });

  it('rejects out-of-range years', () => {
    expect(parseStrictCalendarYear('1899')).toBeNull();
    expect(parseStrictCalendarYear('2101')).toBeNull();
  });

  it('the page renders an explicit invalid-year error (not a clock-derived fallback)', () => {
    const page = readWeb(PAGE);
    expect(page).toContain('parseStrictCalendarYear');
    expect(page).toContain('unified-annual-invalid-year');
    expect(page).toContain('Ano-calendário inválido');
    // Must NOT silently fall back to the current clock year.
    expect(page).not.toMatch(/getFullYear\(\)\s*-\s*1/);
    expect(page).not.toMatch(/Number\.parseInt/);
  });
});
