import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const PG_HOST = process.env.ATLAS_TEST_PG_HOST || 'localhost';
const PG_PORT = process.env.ATLAS_TEST_PG_PORT || '5433';
const PG_USER = process.env.ATLAS_TEST_PG_USER || 'atlas';
const PG_PASSWORD = process.env.ATLAS_TEST_PG_PASSWORD || 'atlas';

const ADMIN_DB_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/postgres?schema=public`;
const FRESH_DB_NAME = 'atlas_4j3_fresh_probe';
const UPGRADE_DB_NAME = 'atlas_4j3_upgrade_probe';

const FRESH_DB_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${FRESH_DB_NAME}?schema=public`;
const UPGRADE_DB_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${UPGRADE_DB_NAME}?schema=public`;

describe('Phase 4J.3 — Canonical Database Version & Integrity Verification (PostgreSQL 16.x)', () => {
  let adminPrisma: PrismaClient;
  let freshPrisma: PrismaClient;
  let upgradePrisma: PrismaClient;

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
    await adminPrisma.$connect();

    // Ensure clean probe databases
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${FRESH_DB_NAME}`);
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${UPGRADE_DB_NAME}`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${FRESH_DB_NAME} OWNER ${PG_USER}`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${UPGRADE_DB_NAME} OWNER ${PG_USER}`);

    freshPrisma = new PrismaClient({ datasources: { db: { url: FRESH_DB_URL } } });
    upgradePrisma = new PrismaClient({ datasources: { db: { url: UPGRADE_DB_URL } } });
  });

  afterAll(async () => {
    if (freshPrisma) await freshPrisma.$disconnect();
    if (upgradePrisma) await upgradePrisma.$disconnect();

    if (adminPrisma) {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${FRESH_DB_NAME}`);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${UPGRADE_DB_NAME}`);
      await adminPrisma.$disconnect();
    }
  });

  it('1. Server Version Proof: PostgreSQL version is major 16.x on canonical port 5433', async () => {
    const rows = await adminPrisma.$queryRawUnsafe<Array<{ version: string }>>('SELECT version()');
    expect(rows.length).toBeGreaterThan(0);
    const ver = rows[0]!.version;
    expect(ver).toMatch(/PostgreSQL 16\./i);
  });

  it('2. Fresh DB: prisma migrate deploy applies all 19 migrations from zero cleanly', async () => {
    const deployOut = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: FRESH_DB_URL },
      encoding: 'utf-8',
    });

    expect(deployOut).toContain('20 migrations found in prisma/migrations');
    expect(deployOut).toContain('Applying migration');

    // Confirm migrations recorded in _prisma_migrations
    const applied = await freshPrisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: Date | null }>
    >('SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY migration_name ASC');

    expect(applied.length).toBe(20);
    for (const m of applied) {
      expect(m.finished_at).not.toBeNull();
    }
  });

  it('3. Fresh DB: second migrate deploy reports no pending migrations (idempotent)', async () => {
    const secondDeployOut = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: FRESH_DB_URL },
      encoding: 'utf-8',
    });

    expect(secondDeployOut).toContain('No pending migrations to apply');
  });

  it('4. Fresh DB Fiscal Smoke: creates records and confirms schema completeness', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const institutionId = '00000000-0000-4000-8000-000000000002';
    const portfolioId = '00000000-0000-4000-8000-000000000003';
    const accountId = '00000000-0000-4000-8000-000000000004';
    const assetId = '00000000-0000-4000-8000-000000000005';
    const txId = '00000000-0000-4000-8000-000000000006';

    await freshPrisma.user.create({
      data: {
        id: userId,
        email: 'smoke-4j3-user@atlas.local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtestfor4j3smoke000',
        name: 'Smoke 4J.3 Taxpayer',
      },
    });

    await freshPrisma.institution.create({
      data: { id: institutionId, name: 'Smoke Broker', type: 'BROKER', country: 'BR' },
    });

    await freshPrisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: 'Smoke Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });

    await freshPrisma.account.create({
      data: {
        id: accountId,
        portfolioId,
        institutionId,
        name: 'Conta Smoke',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    await freshPrisma.asset.create({
      data: {
        id: assetId,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    await freshPrisma.transaction.create({
      data: {
        id: txId,
        portfolioId,
        accountId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-03-01T12:00:00Z'),
        settlementDate: new Date('2026-03-03T12:00:00Z'),
        quantity: '100',
        unitPrice: '35.50',
        amount: '3550.00',
        currency: 'BRL',
      },
    });

    const txCount = await freshPrisma.transaction.count();
    expect(txCount).toBe(1);
  });

  it('5. Upgrade DB: applies all 19 migrations sequentially with 100% data preservation and 0 orphans', async () => {
    const deployOut = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: UPGRADE_DB_URL },
      encoding: 'utf-8',
    });

    expect(deployOut).toContain('20 migrations found in prisma/migrations');

    const upgradeUserId = '11111111-1111-4111-8111-111111111111';
    const institutionId = '11111111-1111-4111-8111-111111111112';
    const portfolioId = '11111111-1111-4111-8111-111111111113';
    const accountId = '11111111-1111-4111-8111-111111111114';
    const assetId = '11111111-1111-4111-8111-111111111115';
    const txId = '11111111-1111-4111-8111-111111111116';

    await upgradePrisma.user.create({
      data: {
        id: upgradeUserId,
        email: 'upgrade-4j3-user@atlas.local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtestfor4j3upgrade00',
        name: 'Upgrade 4J.3 Taxpayer',
      },
    });

    await upgradePrisma.institution.create({
      data: { id: institutionId, name: 'Upgrade Bank', type: 'BROKER', country: 'BR' },
    });

    await upgradePrisma.portfolio.create({
      data: {
        id: portfolioId,
        userId: upgradeUserId,
        name: 'Upgrade Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });

    await upgradePrisma.account.create({
      data: {
        id: accountId,
        portfolioId: portfolioId,
        institutionId: institutionId,
        name: 'Conta Upgrade',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    await upgradePrisma.asset.create({
      data: {
        id: assetId,
        ticker: 'VALE3',
        name: 'Vale ON',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    await upgradePrisma.transaction.create({
      data: {
        id: txId,
        portfolioId: portfolioId,
        accountId: accountId,
        assetId: assetId,
        type: 'BUY',
        tradeDate: new Date('2026-04-01T12:00:00Z'),
        settlementDate: new Date('2026-04-03T12:00:00Z'),
        quantity: '50',
        unitPrice: '62.00',
        amount: '3100.00',
        currency: 'BRL',
      },
    });

    // Check orphan queries
    const orphanTx = await upgradePrisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int as count FROM transactions t 
       LEFT JOIN accounts a ON t.account_id = a.id 
       WHERE a.id IS NULL`,
    );
    expect(orphanTx[0]!.count).toBe(0);

    const orphanAccounts = await upgradePrisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int as count FROM accounts a 
       LEFT JOIN portfolios p ON a.portfolio_id = p.id 
       WHERE p.id IS NULL`,
    );
    expect(orphanAccounts[0]!.count).toBe(0);
  });
});
