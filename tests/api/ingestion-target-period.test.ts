/**
 * Phase 5E-H1 - Target period persistence contract (atlas_test only).
 *
 * Proves the H1 fix: DAY/MONTH/YEAR round-trip exactly, no DATE coercion,
 * invalid granularity rejected before insertion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getTestPrismaClient } from '../database/setup';
import { PrismaJobRepository } from '../../apps/api/src/ingestion/job-repository';
import { PrismaJobLock } from '../../apps/api/src/ingestion/job-lock';
import { JobRunner } from '../../apps/api/src/ingestion/job-runner';
import {
  assertValidTargetPeriod,
  buildLogicalJobKey,
  getPeriodGranularity,
} from '../../apps/api/src/ingestion/job-types';

const prisma = getTestPrismaClient();
const createdKeys: string[] = [];

afterEach(async () => {
  for (const key of createdKeys.splice(0)) {
    await prisma.$executeRaw`DELETE FROM ingestion_job_runs WHERE logical_job_key = ${key}`;
  }
});

function makeCore() {
  const repository = new PrismaJobRepository(prisma);
  const lock = new PrismaJobLock(prisma);
  return { repository, lock, runner: new JobRunner(repository, lock) };
}

describe('H1 period granularity model', () => {
  it('maps the seven daily jobs to DAY, IPCA to MONTH, calendars to YEAR', () => {
    expect(getPeriodGranularity('MARKET_QUOTES_DAILY')).toBe('DAY');
    expect(getPeriodGranularity('BENCHMARK_IBOV_DAILY')).toBe('DAY');
    expect(getPeriodGranularity('BENCHMARK_CDI_DAILY')).toBe('DAY');
    expect(getPeriodGranularity('FX_USD_BRL_DAILY')).toBe('DAY');
    expect(getPeriodGranularity('FX_EUR_BRL_DAILY')).toBe('DAY');
    expect(getPeriodGranularity('MACRO_SELIC_TARGET')).toBe('DAY');
    expect(getPeriodGranularity('MACRO_SELIC_EFFECTIVE')).toBe('DAY');
    expect(getPeriodGranularity('MACRO_IPCA')).toBe('MONTH');
    expect(getPeriodGranularity('CALENDAR_B3_REFRESH')).toBe('YEAR');
    expect(getPeriodGranularity('CALENDAR_BANKING_REFRESH')).toBe('YEAR');
  });

  it('keeps logical keys period-based with attempt excluded', () => {
    expect(buildLogicalJobKey('MARKET_QUOTES_DAILY', '2026-10-18')).toBe(
      'MARKET_QUOTES_DAILY:2026-10-18',
    );
    expect(buildLogicalJobKey('MACRO_IPCA', '2026-10')).toBe('MACRO_IPCA:2026-10');
    expect(buildLogicalJobKey('CALENDAR_B3_REFRESH', '2026')).toBe('CALENDAR_B3_REFRESH:2026');
  });

  it('rejects mismatched granularity and malformed periods without touching PG', () => {
    expect(() => assertValidTargetPeriod('MARKET_QUOTES_DAILY', '2026-10')).toThrow();
    expect(() => assertValidTargetPeriod('MARKET_QUOTES_DAILY', '2026')).toThrow();
    expect(() => assertValidTargetPeriod('MACRO_IPCA', '2026')).toThrow();
    expect(() => assertValidTargetPeriod('MACRO_IPCA', '2026-10-18')).toThrow();
    expect(() => assertValidTargetPeriod('CALENDAR_B3_REFRESH', '2026-10-18')).toThrow();
    expect(() => assertValidTargetPeriod('CALENDAR_B3_REFRESH', '2026-10')).toThrow();
    expect(() => assertValidTargetPeriod('MARKET_QUOTES_DAILY', '2026-13-01')).toThrow();
    expect(() => assertValidTargetPeriod('MARKET_QUOTES_DAILY', '2026-02-30')).toThrow();
    expect(() => assertValidTargetPeriod('MACRO_IPCA', '2026-13')).toThrow();
    expect(() => assertValidTargetPeriod('CALENDAR_B3_REFRESH', 'abcd')).toThrow();
    expect(() => assertValidTargetPeriod('MARKET_QUOTES_DAILY', '')).toThrow();
    expect(() => assertValidTargetPeriod('MARKET_QUOTES_DAILY', '  ')).toThrow();
  });
});

describe('H1 repository round-trip (real atlas_test)', () => {
  it('DAY persists and round-trips exactly', async () => {
    const { repository } = makeCore();
    const key = buildLogicalJobKey('MARKET_QUOTES_DAILY', '2026-10-19');
    createdKeys.push(key);
    const run = await repository.createRun({
      logicalJobKey: key,
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'MANUAL',
      targetPeriod: '2026-10-19',
      targetPeriodGranularity: 'DAY',
      scheduledFor: '2026-10-19',
      attempt: 1,
      startedAt: new Date().toISOString(),
    });
    expect(run.targetPeriod).toBe('2026-10-19');
    expect(run.targetPeriodGranularity).toBe('DAY');
    expect(run.scheduledFor).toBe('2026-10-19');
    expect(run.logicalJobKey).toBe(key);
    const found = await repository.findById(run.jobRunId);
    expect(found?.targetPeriod).toBe('2026-10-19');
    expect(found?.scheduledFor).toBe('2026-10-19');
  });

  it('MONTH persists and round-trips exactly (no first-of-month coercion)', async () => {
    const { repository } = makeCore();
    const key = buildLogicalJobKey('MACRO_IPCA', '2026-10');
    createdKeys.push(key);
    const run = await repository.createRun({
      logicalJobKey: key,
      jobType: 'MACRO_IPCA',
      triggerType: 'MANUAL',
      targetPeriod: '2026-10',
      targetPeriodGranularity: 'MONTH',
      scheduledFor: '2026-10-20',
      attempt: 1,
      startedAt: new Date().toISOString(),
    });
    expect(run.targetPeriod).toBe('2026-10');
    expect(run.targetPeriodGranularity).toBe('MONTH');
    expect(run.scheduledFor).toBe('2026-10-20');
    const found = await repository.findById(run.jobRunId);
    expect(found?.targetPeriod).toBe('2026-10');
  });

  it('YEAR persists and round-trips exactly (no Jan-1 coercion)', async () => {
    const { repository } = makeCore();
    const key = buildLogicalJobKey('CALENDAR_B3_REFRESH', '2026');
    createdKeys.push(key);
    const run = await repository.createRun({
      logicalJobKey: key,
      jobType: 'CALENDAR_B3_REFRESH',
      triggerType: 'MANUAL',
      targetPeriod: '2026',
      targetPeriodGranularity: 'YEAR',
      scheduledFor: '2026-10-20',
      attempt: 1,
      startedAt: new Date().toISOString(),
    });
    expect(run.targetPeriod).toBe('2026');
    expect(run.targetPeriodGranularity).toBe('YEAR');
    expect(run.scheduledFor).toBe('2026-10-20');
    const found = await repository.findById(run.jobRunId);
    expect(found?.targetPeriod).toBe('2026');
  });

  it('runner end-to-end YEAR succeeds (calendar handler, no 500)', async () => {
    const { runner } = makeCore();
    const key = buildLogicalJobKey('CALENDAR_BANKING_REFRESH', '2026');
    createdKeys.push(key);
    const receipt = await runner.run({
      jobType: 'CALENDAR_BANKING_REFRESH',
      triggerType: 'MANUAL',
      targetPeriod: '2026',
      targetPeriodGranularity: 'YEAR',
      scheduledFor: '2026-10-20',
      execute: async () => ({
        status: 'SUCCESS',
        itemsFailed: 0,
        finishedAt: new Date().toISOString(),
        durationMs: 1,
      }),
    });
    expect(receipt.status).toBe('SUCCESS');
    expect(receipt.targetPeriod).toBe('2026');
    expect(receipt.logicalJobKey).toBe(key);
  });
});
