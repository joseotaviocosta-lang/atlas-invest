import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

describe('Database Migration Upgrade: Phase 5B Benchmark Observations (Sections 13 & 54)', () => {
  const adminUrl = 'postgresql://atlas:atlas@localhost:5433/postgres?schema=public';
  const upgradeDbName = 'atlas_5b_upgrade_probe';
  const upgradeDbUrl = `postgresql://atlas:atlas@localhost:5433/${upgradeDbName}?schema=public`;
  const zeroDbName = 'atlas_5b_zero_probe';
  const zeroDbUrl = `postgresql://atlas:atlas@localhost:5433/${zeroDbName}?schema=public`;

  let adminPrisma: PrismaClient;
  let upgradePrisma: PrismaClient;

  const testUserId = randomUUID();
  const testPortfolioId = randomUUID();
  const testAccountId = randomUUID();
  const testAssetId = randomUUID();
  const testTxId = randomUUID();
  const testQuoteId = randomUUID();

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    // Clean probe databases
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}"`);
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${zeroDbName}"`);
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${upgradeDbName}"`);

    upgradePrisma = new PrismaClient({ datasources: { db: { url: upgradeDbUrl } } });

    // 1. Gather all migrations from packages/database/prisma/migrations
    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    const allMigrationDirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(allMigrationDirs.length).toBe(25);

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

    // Apply the first 24 migrations (all migrations prior to 20261016200000_add_benchmark_observations_and_revisions)
    const psqlPath = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
    const pre5bMigrations = allMigrationDirs.slice(0, 24);
    for (const migName of pre5bMigrations) {
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

    // 2. Seed representative financial data in pre-5B (Phase 5A) schema
    await upgradePrisma.user.create({
      data: {
        id: testUserId,
        email: 'pre5b-upgrade@atlas.dev',
        name: 'Pre-5B Investor',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });

    const institution = await upgradePrisma.institution.create({
      data: {
        id: randomUUID(),
        name: 'XP Investimentos',
        type: 'BROKER',
        country: 'BR',
      },
    });

    await upgradePrisma.portfolio.create({
      data: {
        id: testPortfolioId,
        userId: testUserId,
        name: 'Carteira Principal',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });

    await upgradePrisma.account.create({
      data: {
        id: testAccountId,
        portfolioId: testPortfolioId,
        institutionId: institution.id,
        name: 'Conta XP',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    await upgradePrisma.asset.create({
      data: {
        id: testAssetId,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });

    await upgradePrisma.transaction.create({
      data: {
        id: testTxId,
        portfolioId: testPortfolioId,
        accountId: testAccountId,
        assetId: testAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T00:00:00.000Z'),
        settlementDate: new Date('2026-01-12T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '35.00',
        amount: '3500.00',
        currency: 'BRL',
      },
    });

    await upgradePrisma.marketQuoteRecord.create({
      data: {
        id: testQuoteId,
        assetId: testAssetId,
        tradingDate: new Date('2026-10-16T00:00:00.000Z'),
        currency: 'BRL',
        close: new Prisma.Decimal('59.25'),
        provider: 'BRAPI',
        providerSymbol: 'PETR4',
        fetchCount: 1,
      },
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

  it('Section 13 & 54.A: Previous-Head (24) to New Migration (25) Upgrade Drill', async () => {
    // 1. Pre-upgrade state check: exactly 24 migrations
    const appliedPre = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    expect(Number(appliedPre[0]!.count)).toBe(24);

    // 2. Apply canonical migrate deploy (applies only migration 25)
    const deployOutput = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: upgradeDbUrl },
      encoding: 'utf-8',
    });

    expect(deployOutput).toContain('25 migrations found in prisma/migrations');
    expect(deployOutput).toContain(
      'Applying migration `20261016200000_add_benchmark_observations_and_revisions`',
    );
    expect(deployOutput).toContain('All migrations have been successfully applied');

    // 3. Post-upgrade state check: exactly 25 migrations
    const appliedPost = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    expect(Number(appliedPost[0]!.count)).toBe(25);

    // 4. Parity check: 100% preservation of users, portfolios, accounts, assets, transactions, market quotes
    const user = await upgradePrisma.user.findUnique({ where: { id: testUserId } });
    expect(user).toBeDefined();
    expect(user?.email).toBe('pre5b-upgrade@atlas.dev');

    const tx = await upgradePrisma.transaction.findUnique({ where: { id: testTxId } });
    expect(tx).toBeDefined();
    expect(tx?.quantity.toString()).toBe('100');
    expect(tx?.amount.toString()).toBe('3500');

    const quote = await upgradePrisma.marketQuoteRecord.findUnique({ where: { id: testQuoteId } });
    expect(quote).toBeDefined();
    expect(quote?.close.toString()).toBe('59.25');

    // 5. Verify new benchmark tables exist in public schema
    const [{ regclassObservations }] = await upgradePrisma.$queryRawUnsafe<
      Array<{ regclassObservations: string | null }>
    >(`SELECT to_regclass('public.benchmark_observations')::text AS "regclassObservations"`);
    expect(regclassObservations).toBe('benchmark_observations');

    const [{ regclassRevisions }] = await upgradePrisma.$queryRawUnsafe<
      Array<{ regclassRevisions: string | null }>
    >(`SELECT to_regclass('public.benchmark_observation_revisions')::text AS "regclassRevisions"`);
    expect(regclassRevisions).toBe('benchmark_observation_revisions');
  });

  it('Section 13 & 54.B: Zero-to-Head Migration Drill', async () => {
    // Create completely empty database
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${zeroDbName}"`);

    // Run migrate deploy from 0 to head (all 25 migrations)
    const zeroOutput = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: zeroDbUrl },
      encoding: 'utf-8',
    });

    expect(zeroOutput).toContain('25 migrations found in prisma/migrations');
    expect(zeroOutput).toContain('All migrations have been successfully applied.');

    const zeroPrisma = new PrismaClient({ datasources: { db: { url: zeroDbUrl } } });
    try {
      const applied = await zeroPrisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      );
      expect(Number(applied[0]!.count)).toBe(25);

      const [{ regclass }] = await zeroPrisma.$queryRawUnsafe<Array<{ regclass: string | null }>>(
        `SELECT to_regclass('public.benchmark_observations')::text AS "regclass"`,
      );
      expect(regclass).toBe('benchmark_observations');
    } finally {
      await zeroPrisma.$disconnect();
    }
  });

  it('Section 13 & 54.C: Idempotent Migrate Deploy Drill (No Pending Migrations)', async () => {
    const secondDeployOutput = execSync(
      'pnpm --filter @atlas/database exec prisma migrate deploy',
      {
        env: { ...process.env, DATABASE_URL: upgradeDbUrl },
        encoding: 'utf-8',
      },
    );

    expect(secondDeployOutput).toContain('25 migrations found in prisma/migrations');
    expect(secondDeployOutput).toContain('No pending migrations to apply.');
  });
});
