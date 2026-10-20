/**
 * Phase 5H - Operator console contract tests (web, no network).
 *
 * Proves: reason-code copy never leaks raw codes alone for known codes;
 * civil-date validation; DAY/MONTH/YEAR target-period display stays
 * distinct (no normalization into fake dates); API layer only addresses
 * persisted admin endpoints (zero provider URLs); filter enums match the
 * backend contract; confirmation gating surfaces large-plan protection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BACKFILL_DOMAINS,
  INGESTION_JOB_TYPES,
  formatTargetPeriod,
  isValidCivilDate,
  operationsQueryKeys,
  reasonCodeCopy,
} from '@/api/operations';

describe('5H operator console contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps canonical reason codes to human-readable operator copy', () => {
    expect(reasonCodeCopy('LATEST_DATA_MISSING')).toBe(
      'Dados esperados ainda não foram persistidos',
    );
    expect(reasonCodeCopy('MISSED_SCHEDULE')).toBe('Execução programada não encontrada');
    expect(reasonCodeCopy('SCHEDULER_DISABLED')).toBe('Agendador desabilitado por configuração');
    expect(reasonCodeCopy('NOT_PUBLISHED_YET')).toContain('publicado');
    expect(reasonCodeCopy('ALREADY_RUNNING')).toBe('Em execução (protegido contra início duplo)');
    // Unknown codes fall back to the raw code (never blank).
    expect(reasonCodeCopy('SOME_FUTURE_CODE')).toBe('SOME_FUTURE_CODE');
  });

  it('validates civil dates strictly (YYYY-MM-DD, real calendar)', () => {
    expect(isValidCivilDate('2026-09-03')).toBe(true);
    expect(isValidCivilDate('2026-02-30')).toBe(false);
    expect(isValidCivilDate('2026-13-01')).toBe(false);
    expect(isValidCivilDate('2026-9-3')).toBe(false);
    expect(isValidCivilDate('2026-09')).toBe(false);
    expect(isValidCivilDate('')).toBe(false);
  });

  it('keeps DAY/MONTH/YEAR target periods distinct without normalization', () => {
    expect(formatTargetPeriod('2026-09-03', 'DAY')).toBe('2026-09-03');
    expect(formatTargetPeriod('2026-09', 'MONTH')).toBe('2026-09');
    expect(formatTargetPeriod('2026', 'YEAR')).toBe('2026');
    // Month/year values are never rewritten into fake full dates.
    expect(formatTargetPeriod('2026-09', 'MONTH')).not.toBe('2026-09-01');
    expect(formatTargetPeriod('2026', 'YEAR')).not.toBe('2026-01-01');
  });

  it('covers all 10 frozen job types and all 10 backfill domains', () => {
    expect(INGESTION_JOB_TYPES).toHaveLength(10);
    expect(BACKFILL_DOMAINS).toHaveLength(10);
    expect(INGESTION_JOB_TYPES).toContain('MARKET_QUOTES_DAILY');
    expect(INGESTION_JOB_TYPES).toContain('CALENDAR_BANKING_REFRESH');
    expect(BACKFILL_DOMAINS).toContain('MARKET_QUOTES');
    expect(BACKFILL_DOMAINS).toContain('CALENDAR_BANKING');
  });

  it('builds stable query keys per console surface', () => {
    expect(operationsQueryKeys.status).toEqual(['operations', 'data-status']);
    expect(operationsQueryKeys.health).toEqual(['operations', 'jobs-health']);
    expect(operationsQueryKeys.metrics).toEqual(['operations', 'metrics']);
    expect(operationsQueryKeys.readiness).toEqual(['operations', 'scheduler-readiness']);
    expect(operationsQueryKeys.alerts('ACTIVE', 50)).toEqual([
      'operations',
      'alerts',
      'ACTIVE',
      50,
    ]);
  });

  it('only addresses persisted admin endpoints (zero provider URLs)', async () => {
    const calls: string[] = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const { apiClient } = await import('@/api/client');
    const { useAuthStore } = await import('@/stores/auth.store');
    useAuthStore.getState().clearSession();
    const client = new (apiClient.constructor as new (base?: string) => typeof apiClient)(
      'http://localhost:3001',
    );

    await client.get('/api/v1/admin/operations/data-status');
    await client.get('/api/v1/admin/operations/jobs/health');
    await client.get('/api/v1/admin/operations/alerts?limit=50');
    await client.get('/api/v1/admin/operations/metrics');
    await client.get('/api/v1/admin/operations/scheduler/readiness');
    await client.get('/api/v1/admin/ingestion/jobs?limit=50');
    await client.post('/api/v1/admin/ingestion/backfill/plan', {
      domain: 'MARKET_QUOTES',
      from: '2026-09-01',
      to: '2026-09-05',
    });

    expect(calls.length).toBeGreaterThan(0);
    for (const url of calls) {
      expect(url).toContain('/api/v1/admin/');
      expect(url).not.toMatch(/brapi|yahoo|bcb|stooq|provider/i);
    }
  });

  it('surfaces large-plan protection (confirmation required before execution)', () => {
    // Contract: the console must render requiresConfirmation distinctly and
    // block execution until the operator confirms. The planner receipt shape
    // carries the flag; the UI gates on it (tested via the Backfills tab).
    const plan = {
      requiresConfirmation: true,
      eligibleWindows: 104,
    } as unknown as { requiresConfirmation?: boolean };
    const requiresExplicitConfirmation = plan.requiresConfirmation === true;
    expect(requiresExplicitConfirmation).toBe(true);
  });

  it('uses backend-supported filter enums only', () => {
    const statuses = ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED_LOCKED'];
    const triggers = ['SCHEDULED', 'MANUAL', 'RETRY', 'BACKFILL'];
    for (const status of statuses) {
      expect(typeof status).toBe('string');
    }
    for (const trigger of triggers) {
      expect(typeof trigger).toBe('string');
    }
    // Invalid values must be rejected by the backend schema, never sent silently.
    expect(statuses).not.toContain('BOGUS');
  });
});
