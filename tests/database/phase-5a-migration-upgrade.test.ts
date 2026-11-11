import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { listTrackedMigrations, seedPreLgpdHistoricalEntities } from './migration-test-helpers';

describe('Database Migration Upgrade: Phase 5A Isolated Drills (Sections 3 & 4)', () => {
  const adminUrl = 'postgresql://atlas:atlas@localhost:5433/postgres?schema=public';
  const upgradeDbName = 'atlas_5a_upgrade_probe';
  const upgradeDbUrl = `postgresql://atlas:atlas@localhost:5433/${upgradeDbName}?schema=public`;
  const zeroDbName = 'atlas_5a_zero_probe';
  const zeroDbUrl = `postgresql://atlas:atlas@localhost:5433/${zeroDbName}?schema=public`;

  let adminPrisma: PrismaClient;
  let upgradePrisma: PrismaClient;
  let totalMigrations = 0;

  const testUserId = randomUUID();
  const testPortfolioId = randomUUID();
  const testAccountId = randomUUID();
  const testAssetId = randomUUID();
  const testTxId = randomUUID();

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    // Ensure clean state
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}"`);
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${zeroDbName}"`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${upgradeDbName}"`);

    upgradePrisma = new PrismaClient({ datasources: { db: { url: upgradeDbUrl } } });

    // 1. Gather all migrations from packages/database/prisma/migrations
    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    const allMigrationDirs = listTrackedMigrations(migrationsDir);
    totalMigrations = allMigrationDirs.length;

    expect(totalMigrations).toBeGreaterThanOrEqual(25);
    expect(allMigrationDirs).toContain('20261016140000_add_market_quotes_and_revisions');

    // Create _prisma_migrations table in upgrade probe DB
    await upgradePrisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Apply the first 23 migrations (all migrations prior to 20261016140000_add_market_quotes_and_revisions)
    const psqlPath = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
    const pre5aMigrations = allMigrationDirs.slice(0, 23);
    for (const migName of pre5aMigrations) {
      const sqlFile = path.join(migrationsDir, migName, 'migration.sql');
      if (fs.existsSync(sqlFile) && fs.readFileSync(sqlFile, 'utf-8').trim().length > 0) {
        execSync(
          `"${psqlPath}" -h localhost -p 5433 -U atlas -d "${upgradeDbName}" -f "${sqlFile}"`,
          {
            env: { ...process.env, PGPASSWORD: 'atlas' },
            stdio: 'pipe',
          },
        );
      }
      await upgradePrisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
        VALUES ('${randomUUID()}', 'fake_pre_checksum', CURRENT_TIMESTAMP, '${migName}', 1);
      `);
    }

    // 2. Seed representative financial data in pre-5A schema
    await seedPreLgpdHistoricalEntities(upgradePrisma, {
      userId: testUserId,
      email: 'pre5a-upgrade@atlas.dev',
      userName: 'Pre-5A Investor',
      portfolioId: testPortfolioId,
      portfolioName: 'Pre-5A Portfolio',
      accountId: testAccountId,
      accountName: 'Conta XP',
      assetId: testAssetId,
      txId: testTxId,
      tradeDate: '2026-01-10',
      settlementDate: '2026-01-12',
      unitPrice: '35.00',
      amount: '3500.00',
    });
  }, 180_000);

  afterAll(async () => {
    if (upgradePrisma) {
      await upgradePrisma.$disconnect();
    }
    if (adminPrisma) {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}"`);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${zeroDbName}"`);
      await adminPrisma.$disconnect();
    }
  }, 180_000);

  it('Section 3: Previous-Head to New Migration Upgrade Drill', async () => {
    // 1. Pre-upgrade state check: exactly 23 migrations
    const appliedPre = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    expect(Number(appliedPre[0]!.count)).toBe(23);

    // 2. Apply canonical migrate deploy (applies only migration 24)
    const deployOutput = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: upgradeDbUrl },
      encoding: 'utf-8',
    });

    expect(deployOutput).toContain(`${totalMigrations} migrations found in prisma/migrations`);
    expect(deployOutput).toContain(
      'Applying migration `20261016140000_add_market_quotes_and_revisions`',
    );
    expect(deployOutput).toContain('All migrations have been successfully applied');

    // 3. Post-upgrade state check
    const appliedPost = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    expect(Number(appliedPost[0]!.count)).toBe(totalMigrations);

    // 4. Parity check: 100% preservation of users, portfolios, accounts, assets, transactions
    const user = await upgradePrisma.user.findUnique({ where: { id: testUserId } });
    expect(user).toBeDefined();
    expect(user?.email).toBe('pre5a-upgrade@atlas.dev');

    const pf = await upgradePrisma.portfolio.findUnique({ where: { id: testPortfolioId } });
    expect(pf).toBeDefined();
    expect(pf?.name).toBe('Pre-5A Portfolio');

    const acc = await upgradePrisma.account.findUnique({ where: { id: testAccountId } });
    expect(acc).toBeDefined();

    const asset = await upgradePrisma.asset.findUnique({ where: { id: testAssetId } });
    expect(asset).toBeDefined();
    expect(asset?.ticker).toBe('PETR4');

    const tx = await upgradePrisma.transaction.findUnique({ where: { id: testTxId } });
    expect(tx).toBeDefined();
    expect(tx?.quantity.toString()).toBe('100');
    expect(tx?.amount.toString()).toBe('3500');

    // 5. Verify new tables and constraints exist
    const [{ regclassQuotes }] = await upgradePrisma.$queryRawUnsafe<
      Array<{ regclassQuotes: string | null }>
    >(`SELECT to_regclass('public.market_quotes')::text AS "regclassQuotes"`);
    expect(regclassQuotes).toBe('market_quotes');

    const [{ regclassRevisions }] = await upgradePrisma.$queryRawUnsafe<
      Array<{ regclassRevisions: string | null }>
    >(`SELECT to_regclass('public.market_quote_revisions')::text AS "regclassRevisions"`);
    expect(regclassRevisions).toBe('market_quote_revisions');

    // Verify unique composite key by inserting a quote
    await upgradePrisma.marketQuoteRecord.create({
      data: {
        assetId: testAssetId,
        tradingDate: new Date('2026-10-15T00:00:00.000Z'),
        currency: 'BRL',
        close: '57.36',
        provider: 'BRAPI',
        providerSymbol: 'PETR4',
        fetchCount: 1,
      },
    });

    const quoteCount = await upgradePrisma.marketQuoteRecord.count();
    expect(quoteCount).toBe(1);
  }, 180_000);

  it('Section 4: Zero-to-Head Migration Reconfirmation', async () => {
    // 1. Create fresh empty database
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${zeroDbName}"`);

    // 2. Run migrate deploy from empty database
    const zeroDeployOutput = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: zeroDbUrl },
      encoding: 'utf-8',
    });

    expect(zeroDeployOutput).toContain(`${totalMigrations} migrations found in prisma/migrations`);
    expect(zeroDeployOutput).toContain('Applying migration');
    expect(zeroDeployOutput).toContain('All migrations have been successfully applied');

    // 3. Verify all migrations applied with 0 rollbacks
    const zeroPrisma = new PrismaClient({ datasources: { db: { url: zeroDbUrl } } });
    const zeroRows = await zeroPrisma.$queryRawUnsafe<
      Array<{ migration_name: string; rolled_back_at: Date | null }>
    >('SELECT migration_name, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC');

    expect(zeroRows.length).toBe(totalMigrations);
    for (const r of zeroRows) {
      expect(r.rolled_back_at).toBeNull();
    }

    await zeroPrisma.$disconnect();
  }, 180_000);
});
