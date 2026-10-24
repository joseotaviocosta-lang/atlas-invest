import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntegrationConnectionRepository,
  IntegrationJobRepository,
  IntegrationScheduleRepository,
  PortfolioRepository,
} from '@atlas/database';
import {
  IntegrationConnectionService,
  IntegrationSchedulerService,
  IntegrationSettingsService,
  defaultSchedulingPolicy,
} from '../../apps/api/src/application/imports';
import { cleanDatabase, getTestPrismaClient, seedBaseFixtures } from './setup';

/**
 * Phase 5P-E — tampering resilience + production-gate audit (STEP 9/10/37).
 *
 * Proves fail-closed behavior against inconsistent persisted state: an
 * AUTHORIZED row cannot execute while the product is PREPARING, unknown
 * status strings throw instead of executing, and the production defaults
 * are deny-by-default. Real repositories + real DB; only the policy is
 * injected.
 */
describe('API Integration: connection tampering resilience (Phase 5P-E)', () => {
  let userId: string;
  let portfolioId: string;
  const prisma = getTestPrismaClient();

  const repositories = () => ({
    connections: new IntegrationConnectionRepository(prisma),
    portfolios: new PortfolioRepository(prisma),
    schedules: new IntegrationScheduleRepository(prisma),
    jobs: new IntegrationJobRepository(prisma),
  });

  const deniedPolicy = { allowSimulatedSchedules: false };

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
  });

  it('an AUTHORIZED row cannot execute while the product is PREPARING', async () => {
    const repos = repositories();
    await prisma.integrationConnection.create({
      data: {
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: 'AUTHORIZED',
        authorizedAt: new Date('2026-06-15T12:00:00Z'),
        lastCheckedAt: new Date('2026-06-15T12:00:00Z'),
        updatedAt: new Date(),
      },
    });
    const connections = new IntegrationConnectionService(
      repos.connections as never,
      repos.portfolios as never,
      deniedPolicy,
    );
    expect(await connections.isEligible(portfolioId, 'B3')).toBe(false);

    const settings = new IntegrationSettingsService(
      repos.portfolios as never,
      repos.schedules as never,
      repos.jobs as never,
      { listRecentByPortfolioIds: async () => [] } as never,
      repos.connections as never,
      deniedPolicy,
    );
    const model = await settings.getSettings(userId, portfolioId);
    expect(model.sources[0].availability).toBe('PREPARING');
    expect(model.sources[0].status).toBe('PREPARING');
  });

  it('tampered status strings are rejected at the DB and service layers', async () => {
    const repos = repositories();
    await prisma.integrationConnection.create({
      data: {
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: 'AUTHORIZED',
        updatedAt: new Date(),
      },
    });
    // Barrier 1 — the CHECK constraint rejects unknown statuses at write time,
    // so tampering cannot even persist.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "integration_connections" SET "status" = 'SUPERUSER' WHERE "portfolio_id" = '${portfolioId}'::uuid`,
      ),
    ).rejects.toThrow();

    // Barrier 2 — even if an unknown status ever reached the service (e.g. a
    // future migration widening the CHECK), eligibility throws fail-closed
    // instead of resolving.
    const tampered = new IntegrationConnectionService(
      {
        findByPortfolioAndSource: async () => ({
          id: 'conn-1',
          portfolioId,
          source: 'B3',
          provider: 'SIMULATED',
          environment: 'SIMULATED',
          status: 'SUPERUSER',
          authorizedAt: null,
          revokedAt: null,
          lastCheckedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as never,
      repos.portfolios as never,
      { allowSimulatedSchedules: true },
    );
    await expect(tampered.isEligible(portfolioId, 'B3')).rejects.toThrow();
  });

  it('an enabled schedule under PREPARING enqueues nothing', async () => {
    const repos = repositories();
    await prisma.integrationConnection.create({
      data: {
        portfolioId,
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: 'AUTHORIZED',
        authorizedAt: new Date('2026-06-15T12:00:00Z'),
        updatedAt: new Date(),
      },
    });
    await prisma.integrationSchedule.create({
      data: {
        portfolioId,
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
        timezone: 'America/Sao_Paulo',
        enabled: true,
        nextRunAt: new Date('2026-06-16T11:00:00Z'),
        updatedAt: new Date(),
      },
    });
    const deniedConnections = new IntegrationConnectionService(
      repos.connections as never,
      repos.portfolios as never,
      deniedPolicy,
    );
    const scheduler = new IntegrationSchedulerService(
      repos.schedules as never,
      repos.jobs as never,
      deniedConnections as never,
    );
    const result = await scheduler.tick(new Date('2026-06-16T12:00:00Z'));
    expect(result.due).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(result.skippedIneligible).toBe(1);
    expect(await prisma.integrationJob.count({ where: { portfolioId } })).toBe(0);
  });

  it('production defaults deny simulated execution unless explicitly opted in', () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedOptIn = process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES;
      expect(defaultSchedulingPolicy()).toEqual({ allowSimulatedSchedules: false });
      process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES = 'true';
      expect(defaultSchedulingPolicy()).toEqual({ allowSimulatedSchedules: true });
      process.env.NODE_ENV = 'development';
      delete process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES;
      expect(defaultSchedulingPolicy()).toEqual({ allowSimulatedSchedules: true });
    } finally {
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
      if (savedOptIn === undefined) delete process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES;
      else process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES = savedOptIn;
    }
  });

  it('scheduler loop is default-off and never runs under NODE_ENV=test', async () => {
    const { NodeCronIntegrationScheduler } =
      await import('../../apps/api/src/modules/imports/node-cron-integration.scheduler');
    expect(NodeCronIntegrationScheduler.isEnabled()).toBe(false);
  });
});
