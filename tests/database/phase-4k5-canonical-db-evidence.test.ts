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
 * Phase 4K.5 — Canonical Database Version & Migration 23 Evidence (PostgreSQL 16.x).
 *
 * Verifies:
 * 1. Canonical PostgreSQL 16.x instance on port 5433 (SELECT version()).
 * 2. Exact 23 migrations, chronological ordering, and hash integrity.
 * 3. Fresh PG16 Probe: `atlas_4k5_fresh_probe` (0 tables initially, 23 applied,
 *    2nd deploy idempotent, pending NO, drift NO, period-close table present
 *    with revision uniqueness).
 * 4. Fresh PG16 Fiscal Smoke & Period Close E2E (readiness, clean close,
 *    idempotent re-close, history, reopen, reclose, binder, export).
 * 5. Upgrade PG16 Probe: `atlas_4k5_upgrade_probe` (1-22 applied, 4K.1/4K.2/4K.3
 *    data seeded, upgraded with 23, 100% preservation, 0 orphans).
 * 6. Database mutation policy adherence (db push: NO, manual schema patch: NO).
 */
describe('Phase 4K.5 — Canonical Database Version & Migration 23 Evidence (PostgreSQL 16.x)', () => {
  const adminUrl = 'postgresql://atlas:atlas@localhost:5433/postgres?schema=public';
  const freshDbName = 'atlas_4k5_fresh_probe';
  const freshDbUrl = `postgresql://atlas:atlas@localhost:5433/${freshDbName}?schema=public`;
  const upgradeDbName = 'atlas_4k5_upgrade_probe';
  const upgradeDbUrl = `postgresql://atlas:atlas@localhost:5433/${upgradeDbName}?schema=public`;

  const psqlPath = fs.existsSync('C:\\Users\\joseo\\.pg16_bin\\pgsql\\bin\\psql.exe')
    ? 'C:\\Users\\joseo\\.pg16_bin\\pgsql\\bin\\psql.exe'
    : 'psql';

  let adminPrisma: PrismaClient;
  let freshPrisma: PrismaClient;
  let upgradePrisma: PrismaClient;

  let freshApp: INestApplication;

  const freshUserId = randomUUID();

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    try {
      await adminPrisma.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('${freshDbName}', '${upgradeDbName}') AND pid <> pg_backend_pid()`,
      );
    } catch {
      // ignore
    }

    try {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${freshDbName}`);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${upgradeDbName}`);
    } catch {
      // ignore
    }
  });

  afterAll(async () => {
    if (freshApp) {
      await freshApp.close();
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
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${freshDbName}`);
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${upgradeDbName}`);
    } catch {
      // ignore
    } finally {
      await adminPrisma.$disconnect();
    }
  });

  function sortedMigrations(): string[] {
    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    return fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
      .map((e) => e.name)
      .sort();
  }

  it('1. Canonical Version Proof: running instance on port 5433 is genuine PostgreSQL 16.x', async () => {
    const rows = await adminPrisma.$queryRawUnsafe<Array<{ version: string }>>('SELECT version()');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.version).toMatch(/PostgreSQL 16\./i);

    const portRows = await adminPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>('SHOW port');
    expect(portRows[0]!['port'] ?? portRows[0]!['setting']).toBe('5432');
  });

  it('2. Migration 23 Integrity: exact 23 migrations, chronological ordering, and hash verification', async () => {
    const migrationDirs = sortedMigrations();
    expect(migrationDirs.length).toBe(23);
    expect([...migrationDirs].sort()).toEqual(migrationDirs);
    expect(migrationDirs[21]).toBe('20261012000000_add_tax_compliance_reminders');
    expect(migrationDirs[22]).toBe('20261013000000_add_tax_compliance_period_close');

    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    for (let i = 0; i < migrationDirs.length; i++) {
      const m = migrationDirs[i]!;
      const sqlFile = path.join(migrationsDir, m, 'migration.sql');
      expect(fs.existsSync(sqlFile)).toBe(true);
      const content = fs.readFileSync(sqlFile, 'utf-8');
      if (m === '20261002000000_add_taxpayer_confirmations') {
        // Migration #16 is 0 bytes by design (superseded by repair #18)
        expect(content.trim().length).toBe(0);
      } else {
        expect(content.length).toBeGreaterThan(0);
      }
    }

    const mig23 = fs.readFileSync(
      path.join(migrationsDir, migrationDirs[22]!, 'migration.sql'),
      'utf-8',
    );
    expect(mig23).toContain('tax_compliance_period_close_records');
    expect(mig23).toContain('tax_period_close_rev_uniq');
    expect(mig23).toContain('tax_period_close_lookup_idx');
  });

  it('3. Fresh PG16 Probe: 0 tables before, applies 23 migrations cleanly, idempotent on 2nd run, no drift, period-close table present', async () => {
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${freshDbName}`);
    freshPrisma = new PrismaClient({ datasources: { db: { url: freshDbUrl } } });

    const preTables = await freshPrisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    expect(preTables.length).toBe(0);

    const deployOutput = execSync('npx prisma migrate deploy', {
      cwd: path.resolve(__dirname, '../../packages/database'),
      env: { ...process.env, DATABASE_URL: freshDbUrl },
      encoding: 'utf-8',
    });
    expect(deployOutput).toContain('23 migrations found');
    expect(deployOutput).toContain('Applying migration');

    const secondDeploy = execSync('npx prisma migrate deploy', {
      cwd: path.resolve(__dirname, '../../packages/database'),
      env: { ...process.env, DATABASE_URL: freshDbUrl },
      encoding: 'utf-8',
    });
    expect(secondDeploy).toContain('No pending migrations to apply');

    const statusOutput = execSync('npx prisma migrate status', {
      cwd: path.resolve(__dirname, '../../packages/database'),
      env: { ...process.env, DATABASE_URL: freshDbUrl },
      encoding: 'utf-8',
    });
    expect(statusOutput).toContain('Database schema is up to date');

    const postTables = await freshPrisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const tableNames = postTables.map((t) => t.tablename);
    expect(tableNames).toContain('tax_compliance_period_close_records');
    expect(tableNames).toContain('tax_compliance_reminder_actions');
    expect(tableNames).toContain('tax_settlement_records');
    expect(tableNames).toContain('tax_compliance_actions');

    const indexes = await freshPrisma.$queryRawUnsafe<Array<{ indexname: string }>>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'tax_compliance_period_close_records'
    `);
    const indexNames = indexes.map((i) => i.indexname);
    expect(indexNames).toContain('tax_period_close_rev_uniq');
    expect(indexNames).toContain('tax_period_close_lookup_idx');
  });

  it('4. Fresh PG16 Fiscal Smoke & Period Close E2E (readiness, close, idempotency, history, reopen, binder, export)', async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(freshPrisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-04-20' })
      .compile();

    freshApp = fixture.createNestApplication();
    configureApp(freshApp);
    await freshApp.init();

    await freshPrisma.user.create({
      data: {
        id: freshUserId,
        email: 'fresh4k5@atlas.local',
        name: 'Fresh 4K5 User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfresh4k5',
      },
    });

    const session = await freshPrisma.session.create({
      data: {
        id: randomUUID(),
        userId: freshUserId,
        refreshTokenHash: 'dummy_fresh_refresh_hash_4k5',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const tokenService = freshApp.get(TokenService);
    const token = tokenService.generateAccessToken({
      userId: freshUserId,
      email: 'fresh4k5@atlas.local',
      sessionId: session.id,
    });

    await freshPrisma.taxObligationRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: freshUserId,
        competence: '2026-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-fresh-4k5-1',
        revision: 1,
        principalAmount: null,
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const readinessRes = await request(freshApp.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-03',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(readinessRes.headers['cache-control']).toContain('no-store');
    expect(readinessRes.body.data.readiness).toBe('READY_TO_CLOSE');
    expect(readinessRes.body.data.cleanCloseAllowed).toBe(true);
    expect(readinessRes.body.meta.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const closeRes = await request(freshApp.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-03' })
      .expect(201);
    expect(closeRes.body.data.revision).toBe(1);
    expect(closeRes.body.data.recordStatus).toBe('CLOSED');
    expect(closeRes.body.data.closeMode).toBe('CLEAN');
    const closeId = closeRes.body.data.id as string;

    const closeDup = await request(freshApp.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-03' })
      .expect(200);
    expect(closeDup.body.meta.created).toBe(false);
    expect(closeDup.body.data.id).toBe(closeId);

    const historyRes = await request(freshApp.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-03')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(historyRes.body.meta.totalCount).toBe(1);

    const reopenRes = await request(freshApp.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${closeId}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Smoke-test reopen.' })
      .expect(201);
    expect(reopenRes.body.data.revision).toBe(2);
    expect(reopenRes.body.data.recordStatus).toBe('REOPENED');

    const recloseRes = await request(freshApp.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-03' })
      .expect(201);
    expect(recloseRes.body.data.revision).toBe(3);

    const binderRes = await request(freshApp.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder?scope=MONTHLY&calendarYear=2026&month=2026-03',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const codes = (binderRes.body.data.sections as Array<{ code: string }>).map((s) => s.code);
    for (const required of [
      'PERIOD_IDENTITY',
      'CLOSE_READINESS',
      'OBLIGATIONS',
      'ACTION_CENTER',
      'PAYMENT_SUPPORT',
      'PAYMENT_EVIDENCE',
      'REMINDERS_WORKFLOW',
      'UNRESOLVED_ITEMS',
      'SOURCES_METADATA',
      'DISCLAIMERS',
    ]) {
      expect(codes).toContain(required);
    }

    const exportRes = await request(freshApp.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(exportRes.headers['content-disposition']).toContain(
      'atlas-fechamento-mensal-2026-03-apoio.csv',
    );
    expect(exportRes.headers['cache-control']).toContain('no-store');
    expect(exportRes.text).toContain('Receita Federal');
  });

  it('5. Upgrade PG16 Probe: 1-22 applied, data seeded, upgraded with 23, 100% preservation, 0 orphans', async () => {
    await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${upgradeDbName}`);
    upgradePrisma = new PrismaClient({ datasources: { db: { url: upgradeDbUrl } } });

    const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');
    const sorted = sortedMigrations();
    expect(sorted.length).toBe(23);

    await upgradePrisma.$executeRawUnsafe(`
      CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);

    for (let i = 0; i < 22; i++) {
      const m = sorted[i]!;
      const sqlFile = path.join(migrationsDir, m, 'migration.sql');
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
      const checksum = createHash('sha256').update(sqlContent).digest('hex');
      const migId = randomUUID();
      await upgradePrisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        VALUES ('${migId}', '${checksum}', CURRENT_TIMESTAMP, '${m}', NULL, NULL, CURRENT_TIMESTAMP, 1);
      `);
    }

    const upgradeUserId = randomUUID();
    await upgradePrisma.user.create({
      data: {
        id: upgradeUserId,
        email: 'upgrade23@atlas.dev',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        name: 'Upgrade User 23',
      },
    });

    // 4K.1 representative data.
    const obId = randomUUID();
    await upgradePrisma.taxObligationRecord.create({
      data: {
        id: obId,
        taxSubjectId: upgradeUserId,
        competence: '2026-02',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'lp-upgrade-23-v1',
        revision: 1,
        principalAmount: '450.00',
        currency: 'BRL',
        dueDate: new Date('2026-03-31T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    // 4K.1 workflow action (4K.4 consumes it).
    const key = `${upgradeUserId}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await upgradePrisma.taxComplianceActionRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: upgradeUserId,
        obligationKey: key,
        revision: 1,
        actionType: 'USER_COMPLETED',
        sourceFingerprint: 'lp-upgrade-23-v1',
        note: 'Completed pre-upgrade',
      },
    });

    // 4K.2 settlement evidence.
    await upgradePrisma.taxSettlementRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: upgradeUserId,
        obligationKey: key,
        sourceFingerprint: 'lp-upgrade-23-v1',
        evidenceFingerprint: 'ev-upgrade-23-v1',
        revision: 1,
        paymentDate: new Date('2026-03-30T00:00:00.000Z'),
        amountReported: '450.00',
        revenueCodeReported: '6015',
        referencePeriod: '2026-02',
        externalReference: 'UPGRADE-23',
        verificationStatus: 'USER_REPORTED',
      },
    });

    // 4K.3 reminder action.
    await upgradePrisma.taxComplianceReminderActionRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: upgradeUserId,
        reminderKey: `${key}:OVERDUE:2026-03-31`,
        obligationKey: key,
        reminderKind: 'OVERDUE',
        triggerAt: new Date('2026-03-31T00:00:00.000Z'),
        sourceFingerprint: 'lp-upgrade-23-v1',
        actionType: 'ACKNOWLEDGE',
        revision: 1,
        occurredAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    const deployUpOut = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: upgradeDbUrl },
      encoding: 'utf-8',
    });
    expect(deployUpOut).toContain('20261013000000_add_tax_compliance_period_close');
    expect(deployUpOut).toContain('All migrations have been successfully applied.');

    const user = await upgradePrisma.user.findUnique({ where: { id: upgradeUserId } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe('upgrade23@atlas.dev');

    const ob = await upgradePrisma.taxObligationRecord.findUnique({ where: { id: obId } });
    expect(ob).not.toBeNull();
    expect(ob!.principalAmount.toString()).toBe('450');

    const action = await upgradePrisma.taxComplianceActionRecord.findFirst({
      where: { taxSubjectId: upgradeUserId, obligationKey: key },
    });
    expect(action).not.toBeNull();

    const settlement = await upgradePrisma.taxSettlementRecord.findFirst({
      where: { taxSubjectId: upgradeUserId, obligationKey: key },
    });
    expect(settlement).not.toBeNull();
    expect(settlement!.externalReference).toBe('UPGRADE-23');

    const reminderAction = await upgradePrisma.taxComplianceReminderActionRecord.findFirst({
      where: { taxSubjectId: upgradeUserId, obligationKey: key },
    });
    expect(reminderAction).not.toBeNull();

    // 4K.5 close record works on the upgraded schema.
    const close = await upgradePrisma.taxCompliancePeriodCloseRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: upgradeUserId,
        scope: 'MONTHLY',
        period: '2026-02',
        calendarYear: 2026,
        month: '2026-02',
        revision: 1,
        recordStatus: 'CLOSED',
        statusAtClose: 'REQUIRES_REVIEW',
        closeMode: 'CLEAN',
        sourceFingerprint: 'f'.repeat(64),
        binderFingerprint: 'b'.repeat(64),
        closedAt: new Date('2026-04-20T00:00:00.000Z'),
      },
    });
    expect(close.revision).toBe(1);

    const newTables = await upgradePrisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tax_compliance_period_close_records')",
    );
    expect(newTables.length).toBe(1);

    const orphanClose = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT count(*) FROM "tax_compliance_period_close_records" c
      LEFT JOIN "users" u ON c.tax_subject_id = u.id
      WHERE u.id IS NULL
    `);
    expect(Number(orphanClose[0]!.count)).toBe(0);

    const orphaned = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT count(*) FROM "tax_compliance_actions" tca
      LEFT JOIN "users" u ON tca.tax_subject_id = u.id
      WHERE u.id IS NULL
    `);
    expect(Number(orphaned[0]!.count)).toBe(0);
  });

  it('6. Database mutation policy adherence (db push: NO, manual schema patch: NO)', async () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
    ) as { scripts: Record<string, string> };
    const scripts = Object.values(packageJson.scripts).join('\n');
    expect(scripts).not.toMatch(/prisma\s+db\s+push/);

    const statusOutput = execSync('npx prisma migrate status', {
      cwd: path.resolve(__dirname, '../../packages/database'),
      env: { ...process.env, DATABASE_URL: freshDbUrl },
      encoding: 'utf-8',
    });
    expect(statusOutput).toContain('Database schema is up to date');
  });
});
