import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Migration Upgrade: Phase 5C FX Observations (Migration 26)', () => {
  const migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations');

  it('contains exactly 26 migrations in packages/database/prisma/migrations', () => {
    const allMigrationDirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(allMigrationDirs.length).toBe(26);
    expect(allMigrationDirs[24]).toBe('20261016200000_add_benchmark_observations_and_revisions');
    expect(allMigrationDirs[25]).toBe('20261017000000_add_fx_observations_and_revisions');
  });

  it('migration 26 SQL is strictly non-destructive (only creates fx tables and indices)', () => {
    const sqlFile = path.join(
      migrationsDir,
      '20261017000000_add_fx_observations_and_revisions',
      'migration.sql',
    );
    expect(fs.existsSync(sqlFile)).toBe(true);
    const sql = fs.readFileSync(sqlFile, 'utf-8');

    // Asserts no destructive statements
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"users"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"portfolios"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"accounts"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"transactions"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"market_quotes"/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"benchmark_observations"/i);

    // Asserts additive statements
    expect(sql).toMatch(/CREATE TABLE "fx_observations"/i);
    expect(sql).toMatch(/CREATE TABLE "fx_observation_revisions"/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "fx_observations_pair_date_source_type_uniq"/i);
  });
});
