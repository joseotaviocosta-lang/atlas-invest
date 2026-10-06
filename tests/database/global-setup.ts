import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// DB-suite globalSetup: enforce that the canonical test schema is provisioned
// EXCLUSIVELY via `prisma migrate deploy` (never `prisma db push`, never a
// stale db-pushed cluster). This runs once before any DB test file. If the
// deploy fails, or the taxpayer_confirmations table is still absent afterward,
// we fail fast with a clear message so a mis-provisioned DB is caught at suite
// start instead of surfacing as a confusing mid-test foreign-key error.

function resolveTestDatabaseUrl(): string {
  // Mirror tests/database/setup.ts: Vitest injects .env into import.meta.env,
  // but Prisma reads process.env. Load the root .env only when neither var is
  // already set, so CI-provided env always wins.
  if (!process.env.DATABASE_TEST_URL && !process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(process.cwd(), '.env'));
    } catch {
      // Ignored — falls back to explicit env or default below.
    }
  }

  return (
    process.env.DATABASE_TEST_URL ||
    process.env.DATABASE_URL ||
    'postgresql://atlas:atlas@localhost:5433/atlas_test?schema=public'
  );
}

export default async function setup(): Promise<void> {
  const testDatabaseUrl = resolveTestDatabaseUrl();

  // Shell out to the pinned Prisma CLI (single source of truth for the Prisma
  // version); no new dependency. DATABASE_URL points the child at the resolved
  // test URL so the migration applies to the canonical test database.
  try {
    execFileSync('pnpm', ['--filter', '@atlas/database', 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'inherit',
      shell: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[database globalSetup] 'prisma migrate deploy' failed against the test database. ` +
        `The DB suite requires a canonical schema provisioned via migrate deploy ` +
        `(never 'prisma db push'). Underlying error: ${reason}`,
    );
  }

  // Fail fast if the repair migration did not materialize the table.
  const prisma = new PrismaClient({
    datasources: { db: { url: testDatabaseUrl } },
    log: ['warn', 'error'],
  });

  try {
    const [{ table }] = await prisma.$queryRawUnsafe<Array<{ table: string | null }>>(
      `SELECT to_regclass('public.taxpayer_confirmations')::text AS table`,
    );

    if (table === null) {
      throw new Error(
        `[database globalSetup] 'prisma migrate deploy' completed but table ` +
          `'public.taxpayer_confirmations' is still absent. The test database is ` +
          `mis-provisioned (likely a stale or db-pushed schema). Re-create it from ` +
          `tracked migrations against the canonical compose container.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
