/**
 * Fail-closed guard for automated test database isolation (Phase 5D-H1.1).
 *
 * Canonical contract: ALL automated tests that can write database state MUST
 * connect to atlas_test on port 5433. The owner/dev runtime database
 * (atlas_dev on port 5434) must never be touched by a test process.
 *
 * This module is intentionally dependency-free (no Prisma, no NestJS) so it
 * can run in vitest setupFiles before any application module initializes.
 */

export const TEST_DATABASE_SAFETY_VIOLATION = 'TEST_DATABASE_SAFETY_VIOLATION';

export const CANONICAL_TEST_DB_HOST = 'localhost';
export const CANONICAL_TEST_DB_PORT = '5433';
export const CANONICAL_TEST_DB_NAME = 'atlas_test';

const ALLOWED_TEST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface ParsedDatabaseIdentity {
  host: string;
  port: string;
  database: string;
}

export function parseDatabaseUrl(url: string): ParsedDatabaseIdentity {
  const parsed = new URL(url);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `${TEST_DATABASE_SAFETY_VIOLATION}: unsupported database protocol '${parsed.protocol}'. ` +
        `Only postgresql:// URLs are allowed in tests.`,
    );
  }
  return {
    host: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.replace(/^\//, ''),
  };
}

export function isTestDatabaseUrl(url: string): boolean {
  let identity: ParsedDatabaseIdentity;
  try {
    identity = parseDatabaseUrl(url);
  } catch {
    return false;
  }
  return (
    ALLOWED_TEST_HOSTS.has(identity.host) &&
    identity.port === CANONICAL_TEST_DB_PORT &&
    identity.database === CANONICAL_TEST_DB_NAME
  );
}

/**
 * Throws TEST_DATABASE_SAFETY_VIOLATION unless the URL points EXACTLY at the
 * canonical test database (allowed host + port 5433 + database atlas_test).
 * All three conditions are required; no single weak substring check.
 */
export function assertTestDatabaseUrl(url: string | undefined, context: string): string {
  if (!url) {
    throw new Error(
      `${TEST_DATABASE_SAFETY_VIOLATION}: ${context} requires an explicit test DATABASE_URL. ` +
        `Refusing to infer a database from mutable developer environment.`,
    );
  }
  let identity: ParsedDatabaseIdentity;
  try {
    identity = parseDatabaseUrl(url);
  } catch (error) {
    throw new Error(
      `${TEST_DATABASE_SAFETY_VIOLATION}: ${context} received an unparsable DATABASE_URL. ` +
        `Refusing to run. Cause: ${(error as Error).message}`,
    );
  }
  if (
    !ALLOWED_TEST_HOSTS.has(identity.host) ||
    identity.port !== CANONICAL_TEST_DB_PORT ||
    identity.database !== CANONICAL_TEST_DB_NAME
  ) {
    throw new Error(
      `${TEST_DATABASE_SAFETY_VIOLATION}: ${context} refuses to run against non-test database ` +
        `(host='${identity.host}' port='${identity.port || '(empty)'} database='${identity.database}'). ` +
        `Expected host in [localhost, 127.0.0.1, ::1], port '${CANONICAL_TEST_DB_PORT}', ` +
        `database '${CANONICAL_TEST_DB_NAME}'.`,
    );
  }
  return url;
}
