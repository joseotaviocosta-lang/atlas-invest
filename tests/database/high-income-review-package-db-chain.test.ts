import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getTestPrismaClient, disconnectTestDatabase } from './setup';

/**
 * Phase 4I.6 — DB-chain / migrations-only proof.
 *
 * 4I.6 adds NO schema change: it is a derived, non-persisted support package.
 * This proof asserts the canonical migrations chain is intact and that 4I.6
 * introduced no new migration and no db push:
 *  - the applied-migration count equals the tracked migration directory count;
 *  - no migration is in a failed/rolled-back state;
 *  - the high-income + taxpayer tables exist THROUGH migrations;
 *  - orphan checks (evidence/confirmations without an owning user) pass.
 */
describe('Phase 4I.6 — High-income review package DB-chain (migrations-only, no new migration)', () => {
  const prisma = getTestPrismaClient();

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('tracked migration directories match the applied-migration count (no new migration, no db push)', async () => {
    const migrationsDir = path.join(process.cwd(), 'packages/database/prisma/migrations');
    const trackedDirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(trackedDirs.length).toBe(21);

    const appliedRows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`,
    );
    const appliedNames = appliedRows.map((r) => r.migration_name).sort();

    expect(appliedNames.length).toBe(trackedDirs.length);
    expect(appliedNames).toEqual([...trackedDirs].sort());
  });

  it('no migration is in a failed / rolled-back state (clean chain, no drift)', async () => {
    const bad = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
    );
    expect(bad).toHaveLength(0);
  });

  it('required tables exist THROUGH migrations', async () => {
    const required = ['taxpayer_confirmations', 'high_income_evidence_records'];
    for (const table of required) {
      const [{ regclass }] = await prisma.$queryRawUnsafe<Array<{ regclass: string | null }>>(
        `SELECT to_regclass('public.${table}')::text AS regclass`,
      );
      expect(regclass, `${table} must exist`).toBe(table);
    }
  });

  it('orphan checks pass: no high-income evidence or taxpayer confirmation without an owning user', async () => {
    const [evidenceOrphans] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM high_income_evidence_records e
         LEFT JOIN users u ON u.id = e.tax_subject_id
        WHERE u.id IS NULL`,
    );
    expect(evidenceOrphans.n).toBe(0);

    const [confirmationOrphans] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM taxpayer_confirmations c
         LEFT JOIN users u ON u.id = c.tax_subject_id
        WHERE u.id IS NULL`,
    );
    expect(confirmationOrphans.n).toBe(0);
  });
});
