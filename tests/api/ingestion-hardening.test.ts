/**
 * Phase 5E (R3-D) - Retry, partial-success, idempotency, failure safety and
 * zero-live-read hardening (atlas_test only).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { LocalDate } from '@atlas/domain';
import { PrismaMarketQuoteRepository } from '@atlas/database';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { cleanDatabase, getTestPrismaClient, seedBaseFixtures } from '../database/setup';
import {
  buildLogicalJobKey,
  IngestionJobType,
  JobExecutionContext,
  JobExecutionResult,
  JobReceipt,
} from '../../apps/api/src/ingestion/job-types';
import {
  CreateRunInput,
  IJobRepository,
  ListRunsInput,
  ListRunsResult,
} from '../../apps/api/src/ingestion/job-repository';
import { IJobLock, JobLockHandle } from '../../apps/api/src/ingestion/job-lock';
import { JobRunner } from '../../apps/api/src/ingestion/job-runner';
import { PrismaJobRepository } from '../../apps/api/src/ingestion/job-repository';
import { PrismaJobLock } from '../../apps/api/src/ingestion/job-lock';
import { MarketQuotesDailyJob } from '../../apps/api/src/ingestion/jobs/market-quotes-daily.job';
import { CalendarResolutionService } from '../../apps/api/src/application/calendar';
import { UpdatePortfolioMarketDataUseCase } from '../../apps/api/src/application/valuation';
import { IIngestionPortfolioDirectory } from '../../apps/api/src/ingestion/jobs/portfolio-directory';

const prisma = getTestPrismaClient();

class InMemoryJobRepository implements IJobRepository {
  runs = new Map<string, JobReceipt>();
  attempts = new Map<string, number>();
  private seq = 0;

  async nextAttempt(logicalJobKey: string): Promise<number> {
    return (this.attempts.get(logicalJobKey) ?? 0) + 1;
  }

  async reapStaleRuns(): Promise<number> {
    return 0;
  }

  async createRun(input: CreateRunInput): Promise<JobReceipt> {
    this.seq += 1;
    this.attempts.set(input.logicalJobKey, input.attempt);
    const receipt: JobReceipt = {
      jobRunId: `run-${this.seq}`,
      logicalJobKey: input.logicalJobKey,
      jobType: input.jobType,
      triggerType: input.triggerType,
      scheduledFor: input.scheduledFor,
      attempt: input.attempt,
      status: 'RUNNING',
      startedAt: input.startedAt,
      finishedAt: '',
      durationMs: 0,
    };
    this.runs.set(receipt.jobRunId, receipt);
    return receipt;
  }

  async completeRun(runId: string, result: JobExecutionResult): Promise<void> {
    const receipt = this.runs.get(runId);
    if (!receipt) throw new Error('unknown run');
    this.runs.set(runId, { ...receipt, ...result, jobRunId: receipt.jobRunId });
  }

  async findById(runId: string): Promise<JobReceipt | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRuns(_input: ListRunsInput): Promise<ListRunsResult> {
    return { items: [...this.runs.values()], hasMore: false, nextCursor: null };
  }
}

class InMemoryJobLock implements IJobLock {
  private held = new Set<string>();

  async tryAcquire(logicalJobKey: string): Promise<JobLockHandle> {
    if (this.held.has(logicalJobKey)) {
      return { acquired: false, release: async () => undefined };
    }
    this.held.add(logicalJobKey);
    return {
      acquired: true,
      release: async () => {
        this.held.delete(logicalJobKey);
      },
    };
  }
}

function context(jobType: IngestionJobType, scheduledFor: string): JobExecutionContext {
  return {
    jobRunId: 'run-test',
    logicalJobKey: `${jobType}:${scheduledFor}`,
    jobType,
    triggerType: 'SCHEDULED',
    scheduledFor,
    attempt: 1,
    startedAt: new Date().toISOString(),
  };
}

const marketReceipt = () => ({
  portfolioId: 'portfolio-1',
  provider: 'TEST',
  requestedAssets: 1,
  resolvedAssets: 1,
  skippedAssets: 0,
  quotesFetched: 1,
  quotesInserted: 1,
  quotesUnchanged: 0,
  quotesRevised: 0,
  authRequiredAssets: [],
  missingAssets: [],
  rateLimitedAssets: [],
  providerErrors: [],
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  status: 'COMPLETED' as const,
});

describe('Phase 5E R3-D - bounded retry and partial success', () => {
  it('retries at most 3 times with bounded exponential backoff', async () => {
    const repo = new InMemoryJobRepository();
    const runner = new JobRunner(repo, new InMemoryJobLock());
    const sleeps: number[] = [];
    let calls = 0;

    const receipt = await runner.run({
      jobType: 'BENCHMARK_CDI_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10-19',
      maxAttempts: 3,
      backoffBaseMs: 30_000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      execute: async () => {
        calls += 1;
        return {
          status: 'FAILED',
          itemsFailed: 1,
          errorCode: 'BENCHMARK.PROVIDER_UNAVAILABLE',
          errorMessage: 'provider unavailable',
          finishedAt: new Date().toISOString(),
          durationMs: 1,
        };
      },
    });

    expect(calls).toBe(3);
    expect(sleeps).toEqual([30_000, 60_000]);
    expect(receipt.status).toBe('FAILED');
    expect(receipt.attempt).toBe(3);
  });

  it('does not retry permanent validation errors', async () => {
    const repo = new InMemoryJobRepository();
    const runner = new JobRunner(repo, new InMemoryJobLock());
    let calls = 0;

    const receipt = await runner.run({
      jobType: 'MACRO_IPCA',
      triggerType: 'SCHEDULED',
      scheduledFor: '2026-10',
      maxAttempts: 3,
      backoffBaseMs: 1,
      sleep: async () => undefined,
      execute: async () => {
        calls += 1;
        return {
          status: 'FAILED',
          itemsFailed: 1,
          errorCode: 'VALIDATION.INVALID_DATE_RANGE',
          errorMessage: 'bad range',
          finishedAt: new Date().toISOString(),
          durationMs: 1,
        };
      },
    });

    expect(calls).toBe(1);
    expect(receipt.status).toBe('FAILED');
  });

  it('records explicit PARTIAL for 10 requested items when 8 succeed and 2 fail', async () => {
    const calendar = { isTradingDay: async () => true } as unknown as CalendarResolutionService;
    const portfolios = {
      listActive: async () =>
        Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, userId: `u${index}` })),
    } as unknown as IIngestionPortfolioDirectory;

    let index = 0;
    const update = {
      execute: async () => {
        const current = index;
        index += 1;
        if (current >= 8) throw new Error('provider unavailable');
        return marketReceipt();
      },
    } as unknown as UpdatePortfolioMarketDataUseCase;

    const job = new MarketQuotesDailyJob(calendar, portfolios, update);
    const result = await job.execute(context('MARKET_QUOTES_DAILY', '2026-10-19'));

    expect(result.status).toBe('PARTIAL');
    expect(result.itemsRequested).toBe(10);
    expect(result.itemsInserted).toBe(8);
    expect(result.itemsFailed).toBe(2);
  });
});

describe('Phase 5E R3-D - persisted data safety and idempotent reruns', () => {
  beforeEach(async () => {
    await cleanDatabase();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ingestion_job_runs"');
  });

  async function createQuoteFixture(): Promise<{
    assetId: string;
    userId: string;
    portfolioId: string;
  }> {
    const fixtures = await seedBaseFixtures();
    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    return { assetId: asset.id, userId: fixtures.userId, portfolioId: fixtures.portfolioId };
  }

  it('persists 8 of 10 items and records 2 failures as PARTIAL', async () => {
    const assets = await Promise.all(
      Array.from({ length: 10 }, async (_, index) => {
        return prisma.asset.create({
          data: {
            id: randomUUID(),
            ticker: `TEST${index}`,
            name: `Test Asset ${index}`,
            type: 'STOCK',
            currency: 'BRL',
            exchange: 'B3',
          },
        });
      }),
    );

    const quoteRepository = new PrismaMarketQuoteRepository(prisma);
    const core = {
      repository: new PrismaJobRepository(prisma),
      lock: new PrismaJobLock(prisma),
    };
    const runner = new JobRunner(core.repository, core.lock);

    const calendar = { isTradingDay: async () => true } as unknown as CalendarResolutionService;
    const portfolios = {
      listActive: async () =>
        Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, userId: `u${index}` })),
    } as unknown as IIngestionPortfolioDirectory;

    let index = 0;
    const update = {
      execute: async () => {
        const asset = assets[index];
        index += 1;
        if (index > 8) throw new Error('provider unavailable');
        const result = await quoteRepository.upsertQuote({
          assetId: asset!.id,
          tradingDate: LocalDate.from('2026-10-19'),
          currency: 'BRL',
          close: '10.00',
          provider: 'TEST',
          providerSymbol: asset!.ticker,
        });
        return {
          ...marketReceipt(),
          portfolioId: `p${index - 1}`,
          requestedAssets: 1,
          quotesFetched: 1,
          quotesInserted: result.outcome === 'INSERTED' ? 1 : 0,
        };
      },
    } as unknown as UpdatePortfolioMarketDataUseCase;

    const job = new MarketQuotesDailyJob(calendar, portfolios, update);
    const scheduledFor = '2026-10-19';
    const logicalJobKey = buildLogicalJobKey('MARKET_QUOTES_DAILY', scheduledFor);

    const receipt = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: (ctx) => job.execute(ctx),
      maxAttempts: 1,
    });

    expect(receipt.status).toBe('PARTIAL');
    expect(receipt.itemsRequested).toBe(10);
    expect(receipt.itemsInserted).toBe(8);
    expect(receipt.itemsFailed).toBe(2);
    expect(await prisma.marketQuoteRecord.count()).toBe(8);

    await prisma.$executeRaw`DELETE FROM ingestion_job_runs WHERE logical_job_key = ${logicalJobKey}`;
  });

  it('keeps existing good data unchanged when the provider fails', async () => {
    const { assetId, userId, portfolioId } = await createQuoteFixture();
    const quoteRepository = new PrismaMarketQuoteRepository(prisma);
    await quoteRepository.upsertQuote({
      assetId,
      tradingDate: LocalDate.from('2026-10-19'),
      currency: 'BRL',
      close: '38.45',
      provider: 'TEST',
      providerSymbol: 'PETR4',
    });

    const core = {
      repository: new PrismaJobRepository(prisma),
      lock: new PrismaJobLock(prisma),
    };
    const runner = new JobRunner(core.repository, core.lock);

    const calendar = { isTradingDay: async () => true } as unknown as CalendarResolutionService;
    const portfolios = {
      listActive: async () => [{ id: portfolioId, userId }],
    } as unknown as IIngestionPortfolioDirectory;
    const update = {
      execute: async () => {
        throw new Error('provider unavailable');
      },
    } as unknown as UpdatePortfolioMarketDataUseCase;

    const job = new MarketQuotesDailyJob(calendar, portfolios, update);
    const scheduledFor = '2026-10-19';
    const logicalJobKey = buildLogicalJobKey('MARKET_QUOTES_DAILY', scheduledFor);

    const receipt = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: (ctx) => job.execute(ctx),
      maxAttempts: 1,
    });

    expect(receipt.status).toBe('FAILED');

    const quotes = await prisma.marketQuoteRecord.findMany({ where: { assetId } });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.close.toString()).toBe('38.45');

    await prisma.$executeRaw`DELETE FROM ingestion_job_runs WHERE logical_job_key = ${logicalJobKey}`;
  });

  it('reruns the same logical window without duplicate observations and preserves revisions', async () => {
    const { assetId } = await createQuoteFixture();
    const quoteRepository = new PrismaMarketQuoteRepository(prisma);
    const core = {
      repository: new PrismaJobRepository(prisma),
      lock: new PrismaJobLock(prisma),
    };
    const runner = new JobRunner(core.repository, core.lock);
    const scheduledFor = '2026-10-19';
    const logicalJobKey = buildLogicalJobKey('MARKET_QUOTES_DAILY', scheduledFor);

    let close = '38.45';
    const handler = async (): Promise<JobExecutionResult> => {
      const result = await quoteRepository.upsertQuote({
        assetId,
        tradingDate: LocalDate.from(scheduledFor),
        currency: 'BRL',
        close,
        provider: 'TEST',
        providerSymbol: 'PETR4',
      });
      return {
        status: 'SUCCESS',
        itemsRequested: 1,
        itemsFetched: 1,
        itemsInserted: result.outcome === 'INSERTED' ? 1 : 0,
        itemsUnchanged: result.outcome === 'UNCHANGED' ? 1 : 0,
        itemsRevised: result.outcome === 'REVISED' ? 1 : 0,
        itemsFailed: 0,
        finishedAt: new Date().toISOString(),
        durationMs: 1,
      };
    };

    const first = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: handler,
    });
    const second = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: handler,
    });

    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('SUCCESS');
    expect(await prisma.marketQuoteRecord.count({ where: { assetId } })).toBe(1);
    expect(await prisma.marketQuoteRevisionRecord.count()).toBe(0);

    close = '38.50';
    const third = await runner.run({
      jobType: 'MARKET_QUOTES_DAILY',
      triggerType: 'SCHEDULED',
      scheduledFor,
      execute: handler,
    });

    expect(third.status).toBe('SUCCESS');
    expect(await prisma.marketQuoteRecord.count({ where: { assetId } })).toBe(1);
    expect(await prisma.marketQuoteRevisionRecord.count()).toBe(1);

    await prisma.$executeRaw`DELETE FROM ingestion_job_runs WHERE logical_job_key = ${logicalJobKey}`;
  });
});

describe('Phase 5E R3-D - zero live provider reads on user/admin GET endpoints', () => {
  let app: INestApplication;
  let token: string;
  let portfolioId: string;
  let userId: string;
  const originalAllowlist = process.env.INGESTION_OPERATOR_USER_IDS;
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeAll(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    userId = fixtures.userId;
    process.env.INGESTION_OPERATOR_USER_IDS = userId;
    token = (await createAuthenticatedUserSession(userId)).token;
    app = await createTestApp();
  });

  afterAll(async () => {
    if (originalAllowlist === undefined) {
      delete process.env.INGESTION_OPERATOR_USER_IDS;
    } else {
      process.env.INGESTION_OPERATOR_USER_IDS = originalAllowlist;
    }
    fetchSpy.mockRestore();
    await closeTestApp();
  });

  it('performs zero live fetches across valuation, market, benchmark, FX, macro, calendar and admin history reads', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer()).get(`/api/v1/portfolios/${portfolioId}/valuation`).set(auth);
    await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/allocation`)
      .set(auth);
    await request(app.getHttpServer()).get('/api/v1/benchmarks/IBOV/coverage').set(auth);
    await request(app.getHttpServer()).get('/api/v1/fx/USD/BRL/coverage').set(auth);
    await request(app.getHttpServer()).get('/api/v1/macro/context').set(auth);
    await request(app.getHttpServer()).get('/api/v1/calendars/B3_TRADING/coverage').set(auth);
    await request(app.getHttpServer()).get('/api/v1/admin/ingestion/jobs').set(auth);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
