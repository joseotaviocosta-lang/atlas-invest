import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IntegrationConnectionRepository, IntegrationJobRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const connections = new IntegrationConnectionRepository(prisma);
const jobs = new IntegrationJobRepository(prisma);

const USER = 'ee555555-5555-4555-8555-555555555555';
const PORTFOLIO = 'e5555555-5555-4555-8555-555555555555';

async function portfolio(id: string) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'connection@atlas.dev', name: 'Connection', passwordHash: 'x' },
  });
  await prisma.portfolio.create({
    data: {
      id,
      userId: USER,
      name: `P-${id.slice(0, 8)}`,
      baseCurrency: 'BRL',
      type: 'PERSONAL',
      status: 'ACTIVE',
    },
  });
}

describe('Phase 5P-D: integration connection persistence', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await portfolio(PORTFOLIO);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates the lifecycle row NOT_CONNECTED with server-owned fields', async () => {
    const created = await connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' });
    expect(created.status).toBe('NOT_CONNECTED');
    expect(created.environment).toBe('SIMULATED');
    expect(created.provider).toBe('SIMULATED');
    expect(created.authorizedAt).toBeNull();
    expect(created.revokedAt).toBeNull();
    expect(created.lastCheckedAt).toBeNull();
  });

  it('enforces one connection per portfolio and source', async () => {
    await connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' });
    const again = await connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' });
    const rows = await prisma.integrationConnection.findMany({ where: { portfolioId: PORTFOLIO } });
    expect(rows).toHaveLength(1);
    expect(again.id).toBe(rows[0]!.id);
  });

  it('recovers concurrent begins into a single row', async () => {
    const [first, second] = await Promise.all([
      connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' }),
      connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' }),
    ]);
    expect(first.id).toBe(second.id);
    const rows = await prisma.integrationConnection.findMany({ where: { portfolioId: PORTFOLIO } });
    expect(rows).toHaveLength(1);
  });

  it('updates are ownership-scoped (id + portfolio)', async () => {
    const created = await connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' });
    const updated = await connections.update({
      id: created.id,
      portfolioId: PORTFOLIO,
      status: 'AUTHORIZED',
      authorizedAt: new Date('2026-06-16T12:00:00Z'),
      revokedAt: null,
      lastCheckedAt: new Date('2026-06-16T12:00:00Z'),
    });
    expect(updated.status).toBe('AUTHORIZED');
    await expect(
      connections.update({
        id: created.id,
        portfolioId: '00000000-0000-4000-8000-000000000000',
        status: 'REVOKED',
      }),
    ).rejects.toThrow();
    expect(
      await connections.findByPortfolioAndSource('00000000-0000-4000-8000-000000000000', 'B3'),
    ).toBeNull();
  });

  it('cancels claimed jobs without opening runs (worker gate support)', async () => {
    const schedule = await prisma.integrationSchedule.create({
      data: {
        portfolioId: PORTFOLIO,
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
    const { row } = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: new Date('2026-06-16T11:00:00Z'),
    });
    const claimed = await jobs.claimDue(new Date('2026-06-16T12:00:00Z'), 60 * 60 * 1000);
    expect(claimed!.id).toBe(row.id);
    const cancelled = await jobs.markCancelled({
      id: row.id,
      portfolioId: PORTFOLIO,
      attempt: claimed!.attempt,
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.runId).toBeNull();
    expect(await jobs.claimDue(new Date('2026-06-16T12:00:00Z'), 60 * 60 * 1000)).toBeNull();
  });

  it('portfolio deletion cascades to connections, schedules, jobs, runs and links', async () => {
    const { IntegrationRunRepository } = await import('@atlas/database');
    const runs = new IntegrationRunRepository(prisma);
    await connections.ensure({ portfolioId: PORTFOLIO, source: 'B3' });
    const schedule = await prisma.integrationSchedule.create({
      data: {
        portfolioId: PORTFOLIO,
        source: 'B3',
        cadence: 'MANUAL_ONLY',
        updatedAt: new Date(),
      },
    });
    const ensured = await jobs.ensure({
      scheduleId: schedule.id,
      portfolioId: PORTFOLIO,
      source: 'B3',
      scheduledFor: new Date('2026-06-16T11:00:00Z'),
    });
    const run = await runs.create({ portfolioId: PORTFOLIO, source: 'B3' });
    await runs.linkTransactions({
      runId: run.id,
      portfolioId: PORTFOLIO,
      transactionIds: ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'],
    });
    expect(ensured.created).toBe(true);

    await prisma.portfolio.delete({ where: { id: PORTFOLIO } });
    expect(await prisma.integrationConnection.count({ where: { portfolioId: PORTFOLIO } })).toBe(0);
    expect(await prisma.integrationSchedule.count({ where: { portfolioId: PORTFOLIO } })).toBe(0);
    expect(await prisma.integrationJob.count({ where: { portfolioId: PORTFOLIO } })).toBe(0);
    expect(await prisma.integrationRun.count({ where: { portfolioId: PORTFOLIO } })).toBe(0);
    expect(
      await prisma.integrationRunTransaction.count({ where: { portfolioId: PORTFOLIO } }),
    ).toBe(0);
  });

  it('stores no tokens, secrets, certificates, CPF or payloads (schema guard)', async () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), 'packages/database/prisma/schema.prisma'),
      'utf8',
    );
    const model = schema.slice(schema.indexOf('model IntegrationConnection'));
    const block = model.slice(0, model.indexOf('\n}'));
    const columns = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    for (const line of columns) {
      expect(line).not.toMatch(/token|secret|private|cert|password|cpf|payload/i);
    }
    expect(block).toMatch(/authorizedAt/);
    expect(block).toMatch(/revokedAt/);
    expect(block).toMatch(/lastCheckedAt/);
    const dir = path.join(process.cwd(), 'packages/database/prisma/migrations');
    for (const entry of fs.readdirSync(dir)) {
      if (entry === 'migration_lock.toml') continue;
      if (!entry.startsWith('2026102215')) continue;
      const sql = fs
        .readFileSync(path.join(dir, entry, 'migration.sql'), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      expect(sql).not.toMatch(/token|secret|certificate|private_key|password|cpf/i);
    }
  });
});
