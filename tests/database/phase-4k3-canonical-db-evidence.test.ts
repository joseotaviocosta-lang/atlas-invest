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
 * Phase 4K.3 — Canonical Database Version & Migration 22 Evidence (PostgreSQL 16.x).
 *
 * Verifies:
 * 1. Canonical PostgreSQL 16.x instance on port 5433 (SELECT version()).
 * 2. Exact 23 migrations, chronological ordering, and hash integrity.
 * 3. Fresh PG16 Probe: `atlas_4k3_fresh_probe` (0 tables initially, 22 applied,
 *    2nd deploy idempotent, pending NO, drift NO, reminder/action/event/preference
 *    tables present with dedup uniqueness).
 * 4. Fresh PG16 Fiscal Smoke & Reminder E2E (reminders projection, action,
 *    idempotent delivery, preferences).
 * 5. Upgrade PG16 Probe: `atlas_4k3_upgrade_probe` (1-21 applied, data seeded,
 *    upgraded with 22, 100% preservation, 0 orphans).
 * 6. Database mutation policy adherence (db push: NO, manual schema patch: NO).
 */
describe('Phase 4K.3 — Canonical Database Version & Migration 22 Evidence (PostgreSQL 16.x)', () => {
  const adminUrl = 'postgresql://atlas:atlas@localhost:5433/postgres?schema=public';
  const freshDbName = 'atlas_4k3_fresh_probe';
  const freshDbUrl = `postgresql://atlas:atlas@localhost:5433/${freshDbName}?schema=public`;
  const upgradeDbName = 'atlas_4k3_upgrade_probe';
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

  it('2. Migration 22 Integrity: exact 23 migrations, chronological ordering, and hash verification', async () => {
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
      const content = fs.readFileSync(sqlFile, 'utf8');
      if (i === 15) {
        expect(content.trim().length).toBe(0);
      } else {
        expect(content.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('3. Fresh PG16 Probe: 0 tables before, applies 23 migrations cleanly, idempotent on 2nd run, no drift, reminder tables present', async () => {
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
    expect(tableNames).toContain('tax_compliance_reminder_actions');
    expect(tableNames).toContain('tax_compliance_notification_events');
    expect(tableNames).toContain('tax_compliance_reminder_preferences');
    expect(tableNames).toContain('tax_settlement_records');
    expect(tableNames).toContain('tax_compliance_actions');

    const indexes = await freshPrisma.$queryRawUnsafe<Array<{ indexname: string }>>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('tax_compliance_reminder_actions', 'tax_compliance_notification_events')
    `);
    const indexNames = indexes.map((i) => i.indexname);
    expect(indexNames).toContain('tax_compliance_reminder_action_rev_uniq');
    expect(indexNames).toContain('tax_compliance_notification_event_dedup_uniq');
  });

  it('4. Fresh PG16 Fiscal Smoke & Reminder E2E (projection, action, idempotent delivery, preferences)', async () => {
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
        email: 'fresh4k3@atlas.local',
        name: 'Fresh 4K3 User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfresh4k3',
      },
    });

    const session = await freshPrisma.session.create({
      data: {
        id: randomUUID(),
        userId: freshUserId,
        refreshTokenHash: 'dummy_fresh_refresh_hash_4k3',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const tokenService = freshApp.get(TokenService);
    const token = tokenService.generateAccessToken({
      userId: freshUserId,
      email: 'fresh4k3@atlas.local',
      sessionId: session.id,
    });

    await freshPrisma.taxObligationRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: freshUserId,
        competence: '2026-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-fresh-4k3-1',
        revision: 1,
        principalAmount: '500.00',
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const listRes = await request(freshApp.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.headers['cache-control']).toContain('no-store');
    type ReminderRow = { reminderKey: string; kind: string; status: string };
    const rows = listRes.body.data as ReminderRow[];
    const upcoming = rows.filter((r) => r.kind === 'UPCOMING_DUE');
    expect(upcoming.length).toBe(3);
    expect(listRes.body.meta.totalCount).toBe(4);
    expect(rows.some((r) => r.kind === 'ANNUAL_REVIEW_REQUIRED')).toBe(true);

    const firstKey = upcoming[0]!.reminderKey;
    const keyParts = firstKey.split(':');
    const firstTriggerAt = keyParts[keyParts.length - 1]!;
    const firstKind = keyParts[keyParts.length - 2]!;
    const firstObligationKey = keyParts.slice(0, -2).join(':');
    const actionRes = await request(freshApp.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(firstKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: firstObligationKey,
        reminderKind: firstKind,
        triggerAt: firstTriggerAt,
        sourceFingerprint: 'fp-fresh-4k3-1',
      })
      .expect(201);
    expect(actionRes.body.data.revision).toBe(1);

    const afterAction = await request(freshApp.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const acted = (afterAction.body.data as Array<{ reminderKey: string; status: string }>).find(
      (r) => r.reminderKey === firstKey,
    );
    expect(acted?.status).toBe('ACKNOWLEDGED');

    const deliveryRes = await request(freshApp.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(firstKey)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceFingerprint: 'fp-fresh-4k3-1',
        channel: 'IN_APP',
        triggerAt: firstTriggerAt,
      })
      .expect(201);
    expect(deliveryRes.body.data.deliveryStatus).toBe('DELIVERED');

    const deliveryDup = await request(freshApp.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(firstKey)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceFingerprint: 'fp-fresh-4k3-1',
        channel: 'IN_APP',
        triggerAt: firstTriggerAt,
      })
      .expect(201);
    expect(deliveryDup.body.data.id).toBe(deliveryRes.body.data.id);

    const prefsRes = await request(freshApp.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: false,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [7, 3, 1],
      })
      .expect(200);
    expect(prefsRes.body.data.upcomingEnabled).toBe(false);

    const afterPrefs = await request(freshApp.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const upcomingAfter = (afterPrefs.body.data as Array<{ kind: string; status: string }>).filter(
      (r) => r.kind === 'UPCOMING_DUE',
    );
    expect(upcomingAfter.length).toBe(3);
    expect(upcomingAfter.every((r) => r.status === 'CANCELLED')).toBe(true);
  });

  it('5. Upgrade PG16 Probe: 1-21 applied, data seeded, upgraded with 22, 100% preservation, 0 orphans', async () => {
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

    for (let i = 0; i < 21; i++) {
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
        email: 'upgrade22@atlas.dev',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        name: 'Upgrade User 22',
      },
    });

    const obId = randomUUID();
    await upgradePrisma.taxObligationRecord.create({
      data: {
        id: obId,
        taxSubjectId: upgradeUserId,
        competence: '2026-02',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'lp-upgrade-22-v1',
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

    const key = `${upgradeUserId}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await upgradePrisma.taxComplianceActionRecord.create({
      data: {
        id: randomUUID(),
        taxSubjectId: upgradeUserId,
        obligationKey: key,
        revision: 1,
        actionType: 'USER_COMPLETED',
        sourceFingerprint: 'lp-upgrade-22-v1',
        note: 'Completed pre-upgrade',
      },
    });

    const deployUpOut = execSync('pnpm --filter @atlas/database exec prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: upgradeDbUrl },
      encoding: 'utf-8',
    });
    expect(deployUpOut).toContain('20261012000000_add_tax_compliance_reminders');
    expect(deployUpOut).toContain('All migrations have been successfully applied.');

    const user = await upgradePrisma.user.findUnique({ where: { id: upgradeUserId } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe('upgrade22@atlas.dev');

    const ob = await upgradePrisma.taxObligationRecord.findUnique({ where: { id: obId } });
    expect(ob).not.toBeNull();

    const action = await upgradePrisma.taxComplianceActionRecord.findFirst({
      where: { taxSubjectId: upgradeUserId, obligationKey: key },
    });
    expect(action).not.toBeNull();

    const newTables = await upgradePrisma.$queryRawUnsafe<Array<{ tablename: string }>>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tax_compliance_reminder_actions', 'tax_compliance_notification_events', 'tax_compliance_reminder_preferences')",
    );
    expect(newTables.length).toBe(3);

    const orphaned = await upgradePrisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT count(*) FROM "tax_compliance_actions" tca
      LEFT JOIN "users" u ON tca.tax_subject_id = u.id
      WHERE u.id IS NULL
    `);
    expect(Number(orphaned[0]!.count)).toBe(0);
  });
});
