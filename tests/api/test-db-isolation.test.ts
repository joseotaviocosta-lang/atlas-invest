import { describe, it, expect } from 'vitest';
import {
  assertTestDatabaseUrl,
  isTestDatabaseUrl,
  parseDatabaseUrl,
  TEST_DATABASE_SAFETY_VIOLATION,
} from './test-db-guard';
import { getTestPrismaClient } from '../database/setup';

const OWNER_URL = 'postgresql://atlas:atlas@127.0.0.1:5434/atlas_dev?schema=public';
const DEV_5432_URL = 'postgresql://atlas:atlas@127.0.0.1:5432/atlas_dev?schema=public';
const TEST_URL = 'postgresql://atlas:atlas@localhost:5433/atlas_test?schema=public';
const TEST_URL_IPV4 = 'postgresql://atlas:atlas@127.0.0.1:5433/atlas_test?schema=public';

describe('Phase 5D-H1.1: Test Database Isolation', () => {
  describe('fail-closed guard (pure, no DB writes)', () => {
    it('rejects the owner database URL (atlas_dev:5434)', () => {
      expect(() => assertTestDatabaseUrl(OWNER_URL, 'negative-test')).toThrow(
        TEST_DATABASE_SAFETY_VIOLATION,
      );
      expect(isTestDatabaseUrl(OWNER_URL)).toBe(false);
    });

    it('rejects the dev 5432 URL', () => {
      expect(() => assertTestDatabaseUrl(DEV_5432_URL, 'negative-test')).toThrow(
        TEST_DATABASE_SAFETY_VIOLATION,
      );
      expect(isTestDatabaseUrl(DEV_5432_URL)).toBe(false);
    });

    it('rejects a missing DATABASE_URL instead of inferring one', () => {
      expect(() => assertTestDatabaseUrl(undefined, 'negative-test')).toThrow(
        TEST_DATABASE_SAFETY_VIOLATION,
      );
    });

    it('rejects a URL with the test name on the wrong port', () => {
      expect(
        isTestDatabaseUrl('postgresql://atlas:atlas@localhost:5434/atlas_test?schema=public'),
      ).toBe(false);
      expect(() =>
        assertTestDatabaseUrl(
          'postgresql://atlas:atlas@localhost:5434/atlas_test?schema=public',
          'negative-test',
        ),
      ).toThrow(TEST_DATABASE_SAFETY_VIOLATION);
    });

    it('rejects a URL with the test port but a foreign database name', () => {
      expect(
        isTestDatabaseUrl('postgresql://atlas:atlas@localhost:5433/other_db?schema=public'),
      ).toBe(false);
    });

    it('accepts the canonical test database URL (localhost and 127.0.0.1)', () => {
      expect(isTestDatabaseUrl(TEST_URL)).toBe(true);
      expect(isTestDatabaseUrl(TEST_URL_IPV4)).toBe(true);
      expect(assertTestDatabaseUrl(TEST_URL, 'negative-test')).toBe(TEST_URL);
    });

    it('parses host/port/database identity explicitly', () => {
      expect(parseDatabaseUrl(OWNER_URL)).toEqual({
        host: '127.0.0.1',
        port: '5434',
        database: 'atlas_dev',
      });
      expect(parseDatabaseUrl(TEST_URL)).toEqual({
        host: 'localhost',
        port: '5433',
        database: 'atlas_test',
      });
    });
  });

  describe('live connection proof (read-only, test DB only)', () => {
    it('connects to atlas_test via the forced 5433 test URL and never to the owner database', async () => {
      // Client-side proof: the worker env was forced to the canonical test URL.
      expect(process.env.DATABASE_URL).toBeDefined();
      expect(isTestDatabaseUrl(process.env.DATABASE_URL as string)).toBe(true);

      const prisma = getTestPrismaClient();
      const rows = await prisma.$queryRawUnsafe<Array<{ db: string; port: number }>>(
        'SELECT current_database() AS db, inet_server_port() AS port',
      );
      expect(rows).toHaveLength(1);
      // Server-side proof: the connected database IS atlas_test (never atlas_dev).
      expect(rows[0].db).toBe('atlas_test');
      expect(rows[0].db).not.toBe('atlas_dev');
      // Infrastructure note: the Docker-mapped test container listens on 5432
      // internally (host mapping 5433 -> container 5432), so the server
      // reports its own container-side port. The 5433 routing is proven by
      // the forced client URL above plus the server-side database identity.
      expect(rows[0].port).toBe(5432);
    });
  });
});
