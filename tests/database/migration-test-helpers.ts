import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';

/**
 * Returns chronologically sorted tracked Prisma migration directories (`YYYYMMDDHHMMSS_*`).
 */
export function listTrackedMigrations(
  migrationsDir = path.resolve(__dirname, '../../packages/database/prisma/migrations'),
): string[] {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export interface HistoricalSeedOptions {
  userId: string;
  email: string;
  userName?: string;
  portfolioId: string;
  portfolioName?: string;
  institutionId?: string;
  institutionName?: string;
  accountId: string;
  accountName?: string;
  assetId: string;
  ticker?: string;
  assetName?: string;
  txId: string;
  tradeDate?: string;
  settlementDate?: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  marketQuote?: {
    id: string;
    tradingDate: string;
    close: string;
    provider?: string;
    providerSymbol?: string;
  };
}

export async function seedPreLgpdUserOnly(
  prisma: PrismaClient,
  opts: { userId: string; email: string; name: string },
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "users" ("id", "email", "name", "password_hash", "created_at", "updated_at")
    VALUES (
      ${opts.userId}::uuid,
      ${opts.email},
      ${opts.name},
      '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      NOW(),
      NOW()
    )
  `;
}

/**
 * Seeds representative pre-upgrade entities using base schema SQL columns compatible with
 * historical pre-LGPD Prisma migration states (prior to columns added in later migrations such as
 * `users.deactivated_at`), allowing `prisma migrate deploy` upgrade drills to seed at N and assert
 * full preservation via HEAD Prisma Client after upgrading N -> HEAD.
 */
export async function seedPreLgpdHistoricalEntities(
  prisma: PrismaClient,
  opts: HistoricalSeedOptions,
): Promise<{ institutionId: string }> {
  const institutionId = opts.institutionId ?? randomUUID();
  const userName = opts.userName ?? 'Historical Upgrade User';
  const portfolioName = opts.portfolioName ?? 'Pre-Upgrade Portfolio';
  const institutionName = opts.institutionName ?? 'XP Investimentos';
  const accountName = opts.accountName ?? 'Conta Corretora';
  const ticker = opts.ticker ?? 'PETR4';
  const assetName = opts.assetName ?? 'Petrobras PN';
  const tradeDate = opts.tradeDate ?? '2025-05-10';
  const settlementDate = opts.settlementDate ?? '2025-05-12';
  const quantity = opts.quantity ?? '100';
  const unitPrice = opts.unitPrice ?? '35.50';
  const amount = opts.amount ?? '3550.00';

  await seedPreLgpdUserOnly(prisma, {
    userId: opts.userId,
    email: opts.email,
    name: userName,
  });

  await prisma.$executeRaw`
    INSERT INTO "institutions" ("id", "name", "type", "country", "created_at", "updated_at")
    VALUES (${institutionId}::uuid, ${institutionName}, 'BROKER', 'BR', NOW(), NOW())
  `;

  await prisma.$executeRaw`
    INSERT INTO "portfolios" ("id", "user_id", "name", "base_currency", "type", "status", "created_at", "updated_at")
    VALUES (${opts.portfolioId}::uuid, ${opts.userId}::uuid, ${portfolioName}, 'BRL', 'INDIVIDUAL', 'ACTIVE', NOW(), NOW())
  `;

  await prisma.$executeRaw`
    INSERT INTO "accounts" ("id", "portfolio_id", "institution_id", "name", "currency", "status", "created_at", "updated_at")
    VALUES (${opts.accountId}::uuid, ${opts.portfolioId}::uuid, ${institutionId}::uuid, ${accountName}, 'BRL', 'ACTIVE', NOW(), NOW())
  `;

  await prisma.$executeRaw`
    INSERT INTO "assets" ("id", "ticker", "name", "type", "currency", "exchange", "created_at", "updated_at")
    VALUES (${opts.assetId}::uuid, ${ticker}, ${assetName}, 'STOCK', 'BRL', 'B3', NOW(), NOW())
  `;

  await prisma.$executeRaw`
    INSERT INTO "transactions" (
      "id", "portfolio_id", "account_id", "asset_id", "type",
      "trade_date", "settlement_date", "quantity", "unit_price", "amount", "currency",
      "created_at", "updated_at"
    )
    VALUES (
      ${opts.txId}::uuid,
      ${opts.portfolioId}::uuid,
      ${opts.accountId}::uuid,
      ${opts.assetId}::uuid,
      'BUY',
      ${tradeDate}::date,
      ${settlementDate}::date,
      ${quantity}::numeric,
      ${unitPrice}::numeric,
      ${amount}::numeric,
      'BRL',
      NOW(),
      NOW()
    )
  `;

  if (opts.marketQuote) {
    await prisma.$executeRaw`
      INSERT INTO "market_quotes" (
        "id", "asset_id", "trading_date", "currency", "close",
        "provider", "provider_symbol", "created_at", "updated_at"
      )
      VALUES (
        ${opts.marketQuote.id}::uuid,
        ${opts.assetId}::uuid,
        ${opts.marketQuote.tradingDate}::date,
        'BRL',
        ${opts.marketQuote.close}::numeric,
        ${opts.marketQuote.provider ?? 'BRAPI'},
        ${opts.marketQuote.providerSymbol ?? ticker},
        NOW(),
        NOW()
      )
    `;
  }

  return { institutionId };
}
