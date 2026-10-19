/**
 * Vitest setup file for the API suite (Phase 5D-H1.1).
 *
 * Loaded via `setupFiles` in vitest.api.config.ts, therefore executed in every
 * API test worker BEFORE any test file (and before any NestJS AppModule or
 * PrismaClient is constructed).
 *
 * It enforces the canonical test-database contract deterministically:
 *   - host: localhost (or 127.0.0.1 / ::1)
 *   - port: 5433
 *   - database: atlas_test
 *
 * Mechanism: DATABASE_URL is FORCED to the canonical test URL. This closes
 * the hole where test files that build a raw AppModule (no PRISMA_CLIENT
 * override) fell through to the owner database (atlas_dev:5434) via
 * packages/database/.env, because an explicit process.env.DATABASE_URL takes
 * precedence over any .env fallback. DATABASE_TEST_URL is aligned as well so
 * helpers resolving via tests/database/setup.ts reach the same database.
 *
 * Fail-closed: if the resolved URL does not satisfy the contract, the worker
 * aborts immediately with TEST_DATABASE_SAFETY_VIOLATION before any test runs.
 */
import {
  assertTestDatabaseUrl,
  CANONICAL_TEST_DB_HOST,
  CANONICAL_TEST_DB_NAME,
  CANONICAL_TEST_DB_PORT,
} from './test-db-guard';

function resolveCanonicalTestDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_TEST_URL;
  if (fromEnv) {
    return assertTestDatabaseUrl(fromEnv, 'setup-test-env(DATABASE_TEST_URL)');
  }
  return `postgresql://atlas:atlas@${CANONICAL_TEST_DB_HOST}:${CANONICAL_TEST_DB_PORT}/${CANONICAL_TEST_DB_NAME}?schema=public`;
}

const testDatabaseUrl = resolveCanonicalTestDatabaseUrl();

// Force BEFORE any PrismaClient/AppModule construction in this worker.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_TEST_URL = testDatabaseUrl;

// Final fail-closed verification of the effective configuration.
assertTestDatabaseUrl(process.env.DATABASE_URL, 'setup-test-env(effective DATABASE_URL)');
