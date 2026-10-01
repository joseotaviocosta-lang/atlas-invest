import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Deterministic test-env bootstrap (repo-native, no new deps — same pattern as
// packages/database/prisma/seed.ts): Vitest/Vite injects .env into
// import.meta.env, but Prisma/test clients read process.env. Load the root
// .env only when neither var is already set, so CI-provided env always wins.
if (!process.env.DATABASE_TEST_URL && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // Ignored — falls back to explicit env or default below.
  }
}

export const TEST_DATABASE_URL =
  process.env.DATABASE_TEST_URL ||
  process.env.DATABASE_URL ||
  'postgresql://atlas@localhost:5433/atlas_test?schema=public';

let testPrisma: PrismaClient | null = null;

export function getTestPrismaClient(): PrismaClient {
  if (!testPrisma) {
    testPrisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
      log: ['warn', 'error'],
    });
  }
  return testPrisma;
}

export async function cleanDatabase(): Promise<void> {
  const prisma = getTestPrismaClient();
  // Reference data (`federal_tax_deadline_entries`) is intentionally preserved:
  // it is seeded by migration and has no FK to `users`. Obligations and payment
  // evidence cascade from `users`.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "annual_opening_position_inputs", "tax_withholding_input_records", "tax_trade_classification_records", "fii_tax_eligibility_fact_records", "tax_compensation_elections", "tax_carry_forward_entries", "tax_payment_aggregations", "tax_payment_evidence", "tax_obligations", "ai_conversation_messages", "ai_conversations", "password_reset_tokens", "sessions", "transactions", "accounts", "portfolios", "assets", "institutions", "users" CASCADE;
  `);
}

export async function disconnectTestDatabase(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }
}

export async function seedBaseFixtures(): Promise<{
  userId: string;
  institutionId: string;
  portfolioId: string;
  accountId: string;
}> {
  const prisma = getTestPrismaClient();

  const user = await prisma.user.create({
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'test-user@atlas.dev',
      name: 'Test User',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$abcdefghijklmnopqrstuvwxyz0123456789',
    },
  });

  const inst = await prisma.institution.create({
    data: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Test Broker',
      type: 'BROKER',
      country: 'BR',
    },
  });

  const portfolio = await prisma.portfolio.create({
    data: {
      id: '33333333-3333-4333-8333-333333333333',
      userId: user.id,
      name: 'Test Portfolio',
      baseCurrency: 'BRL',
      type: 'PERSONAL',
      status: 'ACTIVE',
    },
  });

  const account = await prisma.account.create({
    data: {
      id: '44444444-4444-4444-8444-444444444444',
      portfolioId: portfolio.id,
      institutionId: inst.id,
      name: 'Test Account',
      currency: 'BRL',
      status: 'ACTIVE',
    },
  });

  return {
    userId: user.id,
    institutionId: inst.id,
    portfolioId: portfolio.id,
    accountId: account.id,
  };
}
