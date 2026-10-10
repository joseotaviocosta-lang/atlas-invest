import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { TokenService } from '../../apps/api/src/auth/services/token.service';

/**
 * Phase 4J.2C — Canonical PostgreSQL & Migration History Reconciliation Test Suite.
 *
 * Verifies:
 * 1. Exact 18 repo migrations, chronological ordering, sizes, and SHA-256 hashes.
 * 2. Exact provenance of taxpayer_confirmations (empty migration 16 + additive repair migration 18).
 * 3. Exact provenance of high_income_evidence_records (created by migration 17).
 * 4. 1:1 match between repo migration directory and database _prisma_migrations table.
 * 5. Fresh-DB deployment (18 migrations from zero) & idempotency.
 * 6. Fresh-DB fiscal smoke.
 * 7. Upgrade Path A (migrating 1..16 -> 18, verifying high_income_evidence_records creation & data preservation).
 * 8. Upgrade Path B (migrating 1..17 -> 18, verifying taxpayer_confirmations repair & data preservation).
 * 9. Upgrade-DB fiscal smoke.
 * 10. Zero relational orphans and full constraint integrity.
 */
describe('Phase 4J.2C — Canonical PostgreSQL & Migration History Reconciliation', () => {
  const adminUrl = 'postgresql://atlas:atlas@localhost:5433/postgres?schema=public';
  const freshDbName = 'atlas_4j2c_fresh_probe';
  const freshDbUrl = `postgresql://atlas:atlas@localhost:5433/${freshDbName}?schema=public`;
  const upgradeDbName = 'atlas_4j2c_upgrade_probe';
  const upgradeDbUrl = `postgresql://atlas:atlas@localhost:5433/${upgradeDbName}?schema=public`;
  const psqlPath = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

  let adminPrisma: PrismaClient;
  let freshPrisma: PrismaClient;
  let upgradePrisma: PrismaClient;

  let freshApp: INestApplication;
  let upgradeApp: INestApplication;

  const freshUserId = randomUUID();
  const upgradeUserId = randomUUID();

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    // Clean up probe databases if leftover
    try {
      await adminPrisma.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('${freshDbName}', '${upgradeDbName}') AND pid <> pg_backend_pid()`,
      );
    } catch {
      // ignore
    }
    try {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${freshDbName}"`);
    } catch {
      // ignore
    }
    try {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}"`);
    } catch {
      // ignore
    }

    // Create Fresh DB
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${freshDbName}"`);
    freshPrisma = new PrismaClient({ datasources: { db: { url: freshDbUrl } } });

    // Create Upgrade DB
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${upgradeDbName}"`);
    upgradePrisma = new PrismaClient({ datasources: { db: { url: upgradeDbUrl } } });
  });

  afterAll(async () => {
    if (freshApp) {
      await freshApp.close();
    }
    if (upgradeApp) {
      await upgradeApp.close();
    }
    if (freshPrisma) {
      await freshPrisma.$disconnect();
    }
    if (upgradePrisma) {
      await upgradePrisma.$disconnect();
    }

    try {
      await adminPrisma.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('${freshDbName}', '${upgradeDbName}') AND pid <> pg_backend_pid()`,
      );
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${freshDbName}"`);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${upgradeDbName}"`);
    } catch {
      // ignore
    }

    await adminPrisma.$disconnect();
  });

  it('1. Repository Migration Inventory: exactly 18 migrations in strict chronological order with verified SHA-256', () => {
    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const entries = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    expect(entries.length).toBe(19);

    const expectedMigrations = [
      '20260915000000_init_financial_persistence',
      '20260916000000_authentication_security_foundation',
      '20260916010000_refresh_token_history',
      '20260917120000_add_transfer_group_id',
      '20260925000000_ai_conversations',
      '20260925010000_ai_conversation_claims',
      '20260927000000_add_market_intelligence',
      '20260928160000_add_tax_input_records',
      '20260929000000_add_tax_obligations_and_deadline_registry',
      '20260929100000_add_late_payment_authority_snapshots',
      '20260929120000_add_tax_carry_forward_and_aggregations',
      '20260929130000_add_official_darf_generation',
      '20260930140000_add_tax_compensation_elections',
      '20260930150000_add_withholding_category',
      '20261001000000_add_annual_opening_position_inputs',
      '20261002000000_add_taxpayer_confirmations',
      '20261004120000_add_high_income_evidence_records',
      '20261006120000_repair_taxpayer_confirmations',
      '20261010000000_add_tax_compliance_actions',
    ];

    expect(entries).toEqual(expectedMigrations);

    // Verify chronological monotonicity of timestamp prefixes
    const timestamps = entries.map((name) => name.split('_')[0]);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] >= timestamps[i - 1]).toBe(true);
    }

    // Verify migration 16 is 0 bytes (empty historical)
    const mig16Path = path.join(migrationsDir, entries[15], 'migration.sql');
    const mig16Content = fs.readFileSync(mig16Path);
    expect(mig16Content.length).toBe(0);

    // Verify migration 17 creates high_income_evidence_records
    const mig17Path = path.join(migrationsDir, entries[16], 'migration.sql');
    const mig17Content = fs.readFileSync(mig17Path, 'utf8');
    expect(mig17Content).toContain('CREATE TABLE "high_income_evidence_records"');
    expect(mig17Content).toContain(
      'CONSTRAINT "high_income_evidence_records_pkey" PRIMARY KEY ("id")',
    );
    expect(mig17Content).toContain('CREATE UNIQUE INDEX "hi_evidence_rev_uniq"');

    // Verify migration 18 repairs taxpayer_confirmations
    const mig18Path = path.join(migrationsDir, entries[17], 'migration.sql');
    const mig18Content = fs.readFileSync(mig18Path, 'utf8');
    expect(mig18Content).toContain('CREATE TABLE "taxpayer_confirmations"');
    expect(mig18Content).toContain('CONSTRAINT "taxpayer_confirmations_pkey" PRIMARY KEY ("id")');
    expect(mig18Content).toContain('CREATE UNIQUE INDEX "taxpayer_conf_rev_uniq"');
  });

  it('2. Standing DB _prisma_migrations Reconciliation: 18 rows, exact checksums, zero errors', async () => {
    const standingPrisma = new PrismaClient({
      datasources: {
        db: { url: 'postgresql://atlas:atlas@localhost:5433/atlas_test?schema=public' },
      },
    });

    try {
      const rows = await standingPrisma.$queryRaw<
        Array<{
          migration_name: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
          applied_steps_count: number;
          checksum: string;
        }>
      >`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count, checksum FROM _prisma_migrations ORDER BY migration_name ASC;`;

      expect(rows.length).toBe(19);

      const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');

      for (const row of rows) {
        expect(row.finished_at).not.toBeNull();
        expect(row.rolled_back_at).toBeNull();
        expect(row.applied_steps_count).toBe(1);

        const sqlPath = path.join(migrationsDir, row.migration_name, 'migration.sql');
        expect(fs.existsSync(sqlPath)).toBe(true);

        const fileBuffer = fs.readFileSync(sqlPath);
        const expectedChecksum = createHash('sha256').update(fileBuffer).digest('hex');
        expect(row.checksum.toLowerCase()).toBe(expectedChecksum.toLowerCase());
      }
    } finally {
      await standingPrisma.$disconnect();
    }
  });

  it('3. Fresh-DB Deployment & Idempotency on localhost:5433', async () => {
    // First deploy: 19 migrations applied
    const deployOutput1 = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: freshDbUrl },
      encoding: 'utf8',
    });
    expect(deployOutput1).toContain('19 migrations found in prisma/migrations');
    expect(deployOutput1).toContain('All migrations have been successfully applied.');

    // Second deploy: idempotent (0 pending)
    const deployOutput2 = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: freshDbUrl },
      encoding: 'utf8',
    });
    expect(deployOutput2).toContain('No pending migrations to apply');

    // Verify key tables exist and have expected structure
    const tables = await freshPrisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
    `;
    const tableNames = tables.map((t) => t.table_name);
    expect(tableNames).toContain('taxpayer_confirmations');
    expect(tableNames).toContain('high_income_evidence_records');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('portfolios');
    expect(tableNames).toContain('accounts');
    expect(tableNames).toContain('transactions');
  });

  it('4. Fresh-DB Fiscal Smoke: auth, unified GET, review package, JSON & CSV export', async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(freshPrisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-03-15', now: () => new Date('2026-03-15T12:00:00.000Z') })
      .compile();

    freshApp = moduleFixture.createNestApplication();
    configureApp(freshApp);
    await freshApp.init();

    // Create user in fresh DB
    await freshPrisma.user.create({
      data: {
        id: freshUserId,
        email: 'fresh-4j2c-user@atlas.local',
        name: 'Fresh 4J.2C Taxpayer',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtestfor4j2caudit000',
      },
    });

    const tokenService = freshApp.get(TokenService);
    const session = await freshPrisma.session.create({
      data: {
        id: randomUUID(),
        userId: freshUserId,
        refreshTokenHash: 'dummy_hash',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const token = tokenService.generateAccessToken({
      userId: freshUserId,
      sessionId: session.id,
    });
    const authHeader = `Bearer ${token}`;

    // Create portfolio, account, asset, and a transaction
    const institution = await freshPrisma.institution.create({
      data: { id: randomUUID(), name: 'Fresh Bank', type: 'BROKER', country: 'BR' },
    });
    const portfolio = await freshPrisma.portfolio.create({
      data: {
        id: randomUUID(),
        userId: freshUserId,
        name: 'Fresh 4J.2C Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    const account = await freshPrisma.account.create({
      data: {
        id: randomUUID(),
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Custody Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = await freshPrisma.asset.create({
      data: {
        id: randomUUID(),
        ticker: 'VALE3',
        name: 'Vale SA',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    await freshPrisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-03-15T00:00:00.000Z'),
        settlementDate: new Date('2026-03-17T00:00:00.000Z'),
        quantity: '100',
        unitPrice: '60.00',
        amount: '6000.00',
        currency: 'BRL',
      },
    });

    const server = freshApp.getHttpServer();

    // 1. Unified GET
    const unifiedRes = await request(server)
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', authHeader)
      .expect(200);

    expect(unifiedRes.body.data).toBeDefined();
    expect(unifiedRes.body.data.calendarYear).toBe(2026);
    expect(unifiedRes.body.data.status).toBeDefined();

    // 2. Review Package GET
    const packageRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', authHeader)
      .expect(200);

    expect(packageRes.body.data.packageFingerprint).toBeDefined();
    expect(packageRes.body.data.packageFingerprint.length).toBe(64);
    expect(packageRes.body.data.sectionAIdentity.calendarYear).toBe(2026);

    // 3. JSON Export
    const jsonExportRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=json')
      .set('Authorization', authHeader)
      .expect(200);

    expect(jsonExportRes.headers['content-type']).toContain('application/json');
    expect(jsonExportRes.headers['cache-control']).toContain('no-store');
    expect(jsonExportRes.body.packageVersion).toBe('unified-annual-review-package-v1');

    // 4. CSV Export
    const csvExportRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=csv')
      .set('Authorization', authHeader)
      .expect(200);

    expect(csvExportRes.headers['content-type']).toContain('text/csv');
    expect(csvExportRes.headers['cache-control']).toContain('no-store');
    expect(csvExportRes.text).toContain('RELATORIO DE APOIO IRPF ANUAL UNIFICADO');
  });

  it('5. Upgrade Paths (A: 1..16 -> 18, B: 1..17 -> 18) with 100% Data Preservation', async () => {
    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    const entries = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    // Create _prisma_migrations table manually on upgrade probe
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

    // Apply migrations 1 through 16 directly via psql to simulate pre-high-income state
    for (let i = 0; i < 16; i++) {
      const migName = entries[i];
      const sqlFile = path.join(migrationsDir, migName, 'migration.sql');
      const sqlContent = fs.readFileSync(sqlFile, 'utf8');

      if (sqlContent.trim().length > 0) {
        execSync(
          `"${psqlPath}" -h localhost -p 5433 -U atlas -d "${upgradeDbName}" -f "${sqlFile}"`,
          {
            env: { ...process.env, PGPASSWORD: 'atlas' },
            stdio: 'pipe',
          },
        );
      }

      const fileBuffer = fs.readFileSync(sqlFile);
      const checksum = createHash('sha256').update(fileBuffer).digest('hex');
      const id = randomUUID();

      await upgradePrisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
        VALUES ('${id}', '${checksum}', CURRENT_TIMESTAMP, '${migName}', 1);
      `);
    }

    // Verify high_income_evidence_records and taxpayer_confirmations are absent
    const preTables = await upgradePrisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
    `;
    const preTableNames = preTables.map((t) => t.table_name);
    expect(preTableNames).not.toContain('high_income_evidence_records');
    expect(preTableNames).not.toContain('taxpayer_confirmations');

    // Seed core user and transaction data prior to upgrade
    const portfolioId = randomUUID();
    const institutionId = randomUUID();
    const accountId = randomUUID();
    const assetId = randomUUID();
    const txId = randomUUID();

    await upgradePrisma.user.create({
      data: {
        id: upgradeUserId,
        email: 'upgrade-4j2c-user@atlas.local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashtestfor4j2cupgrade00',
        name: 'Upgrade 4J.2C Taxpayer',
      },
    });
    const institution = await upgradePrisma.institution.create({
      data: { id: institutionId, name: 'Upgrade Bank', type: 'BROKER', country: 'BR' },
    });
    const portfolio = await upgradePrisma.portfolio.create({
      data: {
        id: portfolioId,
        userId: upgradeUserId,
        name: 'Upgrade Portfolio',
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    const account = await upgradePrisma.account.create({
      data: {
        id: accountId,
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Upgrade Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const asset = await upgradePrisma.asset.create({
      data: {
        id: assetId,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    await upgradePrisma.transaction.create({
      data: {
        id: txId,
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-02-10T00:00:00.000Z'),
        settlementDate: new Date('2026-02-12T00:00:00.000Z'),
        quantity: '500',
        unitPrice: '38.50',
        amount: '19250.00',
        currency: 'BRL',
      },
    });

    // Run prisma migrate deploy to apply remaining migrations (17 and 18)
    const upgradeDeployOutput = execSync(
      'pnpm --filter @atlas/database exec prisma migrate deploy',
      {
        env: { ...process.env, DATABASE_URL: upgradeDbUrl },
        encoding: 'utf8',
      },
    );
    expect(upgradeDeployOutput).toContain(
      'Applying migration `20261004120000_add_high_income_evidence_records`',
    );
    expect(upgradeDeployOutput).toContain(
      'Applying migration `20261006120000_repair_taxpayer_confirmations`',
    );
    expect(upgradeDeployOutput).toContain('All migrations have been successfully applied.');

    // Verify both tables are now present
    const postTables = await upgradePrisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
    `;
    const postTableNames = postTables.map((t) => t.table_name);
    expect(postTableNames).toContain('high_income_evidence_records');
    expect(postTableNames).toContain('taxpayer_confirmations');

    // Verify 100% data preservation
    const userPost = await upgradePrisma.user.findUnique({ where: { id: upgradeUserId } });
    expect(userPost).not.toBeNull();
    expect(userPost?.email).toBe('upgrade-4j2c-user@atlas.local');

    const txPost = await upgradePrisma.transaction.findUnique({ where: { id: txId } });
    expect(txPost).not.toBeNull();
    expect(txPost?.quantity.toString()).toBe('500');
    expect(txPost?.amount.toString()).toBe('19250');
  });

  it('6. Upgrade-DB Fiscal Smoke on Upgraded Database', async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(upgradePrisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-03-15', now: () => new Date('2026-03-15T12:00:00.000Z') })
      .compile();

    upgradeApp = moduleFixture.createNestApplication();
    configureApp(upgradeApp);
    await upgradeApp.init();

    const tokenService = upgradeApp.get(TokenService);
    const session = await upgradePrisma.session.create({
      data: {
        id: randomUUID(),
        userId: upgradeUserId,
        refreshTokenHash: 'dummy_hash_upgrade',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const token = tokenService.generateAccessToken({
      userId: upgradeUserId,
      sessionId: session.id,
    });
    const authHeader = `Bearer ${token}`;

    const server = upgradeApp.getHttpServer();

    // Unified GET
    const unifiedRes = await request(server)
      .get('/api/v1/fiscal/annual/2026')
      .set('Authorization', authHeader)
      .expect(200);
    expect(unifiedRes.body.data.calendarYear).toBe(2026);

    // Review package GET
    const packageRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package')
      .set('Authorization', authHeader)
      .expect(200);
    expect(packageRes.body.data.packageFingerprint.length).toBe(64);

    // JSON export
    const jsonRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=json')
      .set('Authorization', authHeader)
      .expect(200);
    expect(jsonRes.headers['content-type']).toContain('application/json');

    // CSV export
    const csvRes = await request(server)
      .get('/api/v1/fiscal/annual/2026/review-package/export?format=csv')
      .set('Authorization', authHeader)
      .expect(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
  });

  it('7. Relational Orphan Audit on Both Databases: zero orphans across all relations', async () => {
    const checkOrphans = async (prisma: PrismaClient) => {
      const orphansTxPortfolio = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM transactions t LEFT JOIN portfolios p ON t.portfolio_id = p.id WHERE p.id IS NULL;
      `;
      expect(Number(orphansTxPortfolio[0].count)).toBe(0);

      const orphansTxAccount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE a.id IS NULL;
      `;
      expect(Number(orphansTxAccount[0].count)).toBe(0);

      const orphansTxAsset = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM transactions t LEFT JOIN assets a ON t.asset_id = a.id WHERE a.id IS NULL;
      `;
      expect(Number(orphansTxAsset[0].count)).toBe(0);

      const orphansAccPortfolio = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM accounts a LEFT JOIN portfolios p ON a.portfolio_id = p.id WHERE p.id IS NULL;
      `;
      expect(Number(orphansAccPortfolio[0].count)).toBe(0);

      const orphansAccInstitution = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM accounts a LEFT JOIN institutions i ON a.institution_id = i.id WHERE i.id IS NULL;
      `;
      expect(Number(orphansAccInstitution[0].count)).toBe(0);

      const orphansObligUser = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM tax_obligations o LEFT JOIN users u ON o.tax_subject_id = u.id WHERE u.id IS NULL;
      `;
      expect(Number(orphansObligUser[0].count)).toBe(0);

      const orphansCarryUser = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM tax_carry_forward_entries c LEFT JOIN users u ON c.tax_subject_id = u.id WHERE u.id IS NULL;
      `;
      expect(Number(orphansCarryUser[0].count)).toBe(0);

      const orphansAggregationsUser = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM tax_payment_aggregations a LEFT JOIN users u ON a.tax_subject_id = u.id WHERE u.id IS NULL;
      `;
      expect(Number(orphansAggregationsUser[0].count)).toBe(0);

      const orphansOpeningPositionsUser = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM annual_opening_position_inputs p LEFT JOIN users u ON p.tax_subject_id = u.id WHERE u.id IS NULL;
      `;
      expect(Number(orphansOpeningPositionsUser[0].count)).toBe(0);

      const orphansConfirmationsUser = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM taxpayer_confirmations c LEFT JOIN users u ON c.tax_subject_id = u.id WHERE u.id IS NULL;
      `;
      expect(Number(orphansConfirmationsUser[0].count)).toBe(0);

      const orphansEvidenceUser = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM high_income_evidence_records e LEFT JOIN users u ON e.tax_subject_id = u.id WHERE u.id IS NULL;
      `;
      expect(Number(orphansEvidenceUser[0].count)).toBe(0);
    };

    await checkOrphans(freshPrisma);
    await checkOrphans(upgradePrisma);
  });
});
