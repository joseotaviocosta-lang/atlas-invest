import * as path from 'path';

// Load .env file if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../.env'));
  } catch {
    try {
      process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
    } catch {
      // Ignored if not found
    }
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.info('Seeding Project Atlas database...');

  // 1. User
  const user = await prisma.user.upsert({
    where: { email: 'investor@project-atlas.io' },
    update: { name: 'Atlas Investor' },
    create: {
      id: 'a0000000-0000-4000-8000-000000000001',
      email: 'investor@project-atlas.io',
      name: 'Atlas Investor',
      passwordHash:
        '$argon2id$v=19$m=65536,t=3,p=4$seedhashdummy$abcdefghijklmnopqrstuvwxyz0123456789',
    },
  });
  console.info(`User seeded: ${user.id} (${user.email})`);

  // 2. Institutions
  const xp = await prisma.institution.upsert({
    where: { id: 'b0000000-0000-4000-8000-000000000001' },
    update: { name: 'XP Investimentos' },
    create: {
      id: 'b0000000-0000-4000-8000-000000000001',
      name: 'XP Investimentos',
      type: 'BROKER',
      country: 'BR',
    },
  });

  const nu = await prisma.institution.upsert({
    where: { id: 'b0000000-0000-4000-8000-000000000002' },
    update: { name: 'Nubank / NuInvest' },
    create: {
      id: 'b0000000-0000-4000-8000-000000000002',
      name: 'Nubank / NuInvest',
      type: 'BROKER',
      country: 'BR',
    },
  });
  console.info(`Institutions seeded: ${xp.name}, ${nu.name}`);

  // 3. Portfolio
  const portfolio = await prisma.portfolio.upsert({
    where: { id: 'c0000000-0000-4000-8000-000000000001' },
    update: { name: 'Carteira Principal' },
    create: {
      id: 'c0000000-0000-4000-8000-000000000001',
      userId: user.id,
      name: 'Carteira Principal',
      baseCurrency: 'BRL',
      type: 'PERSONAL',
      status: 'ACTIVE',
    },
  });
  console.info(`Portfolio seeded: ${portfolio.id} (${portfolio.name})`);

  // 4. Accounts
  const xpAccount = await prisma.account.upsert({
    where: { id: 'd0000000-0000-4000-8000-000000000001' },
    update: { name: 'XP Conta Investimentos' },
    create: {
      id: 'd0000000-0000-4000-8000-000000000001',
      portfolioId: portfolio.id,
      institutionId: xp.id,
      name: 'XP Conta Investimentos',
      currency: 'BRL',
      status: 'ACTIVE',
    },
  });

  const nuAccount = await prisma.account.upsert({
    where: { id: 'd0000000-0000-4000-8000-000000000002' },
    update: { name: 'NuInvest Custodia' },
    create: {
      id: 'd0000000-0000-4000-8000-000000000002',
      portfolioId: portfolio.id,
      institutionId: nu.id,
      name: 'NuInvest Custodia',
      currency: 'BRL',
      status: 'ACTIVE',
    },
  });
  console.info(`Accounts seeded: ${xpAccount.name}, ${nuAccount.name}`);

  // 5. Assets (B3)
  const petr4 = await prisma.asset.upsert({
    where: { ticker_exchange: { ticker: 'PETR4', exchange: 'BVMF' } },
    update: { name: 'Petrobras PN' },
    create: {
      id: 'e0000000-0000-4000-8000-000000000001',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      type: 'EQUITY',
      currency: 'BRL',
      exchange: 'BVMF',
    },
  });

  const vale3 = await prisma.asset.upsert({
    where: { ticker_exchange: { ticker: 'VALE3', exchange: 'BVMF' } },
    update: { name: 'Vale ON' },
    create: {
      id: 'e0000000-0000-4000-8000-000000000002',
      ticker: 'VALE3',
      name: 'Vale ON',
      type: 'EQUITY',
      currency: 'BRL',
      exchange: 'BVMF',
    },
  });

  const hglg11 = await prisma.asset.upsert({
    where: { ticker_exchange: { ticker: 'HGLG11', exchange: 'BVMF' } },
    update: { name: 'CSHG Logistica FII' },
    create: {
      id: 'e0000000-0000-4000-8000-000000000003',
      ticker: 'HGLG11',
      name: 'CSHG Logistica FII',
      type: 'FII',
      currency: 'BRL',
      exchange: 'BVMF',
    },
  });

  const _ivvb11 = await prisma.asset.upsert({
    where: { ticker_exchange: { ticker: 'IVVB11', exchange: 'BVMF' } },
    update: { name: 'iShares S&P 500 Fundo de Indice' },
    create: {
      id: 'e0000000-0000-4000-8000-000000000004',
      ticker: 'IVVB11',
      name: 'iShares S&P 500 Fundo de Indice',
      type: 'ETF',
      currency: 'BRL',
      exchange: 'BVMF',
    },
  });
  console.info(`Assets seeded: PETR4, VALE3, HGLG11, IVVB11`);

  // 6. Sample Transactions
  const seedTx1 = await prisma.transaction.upsert({
    where: {
      portfolio_provider_external_id_unique: {
        portfolioId: portfolio.id,
        provider: 'SEED',
        externalId: 'TX-SEED-001',
      },
    },
    update: {},
    create: {
      id: 'f0000000-0000-4000-8000-000000000001',
      portfolioId: portfolio.id,
      accountId: xpAccount.id,
      type: 'DEPOSIT',
      currency: 'BRL',
      tradeDate: new Date('2026-01-05T00:00:00.000Z'),
      amount: '50000.000000000000000000',
      source: 'MANUAL',
      provider: 'SEED',
      externalId: 'TX-SEED-001',
      notes: 'Initial cash deposit',
    },
  });

  const seedTx2 = await prisma.transaction.upsert({
    where: {
      portfolio_provider_external_id_unique: {
        portfolioId: portfolio.id,
        provider: 'SEED',
        externalId: 'TX-SEED-002',
      },
    },
    update: {},
    create: {
      id: 'f0000000-0000-4000-8000-000000000002',
      portfolioId: portfolio.id,
      accountId: xpAccount.id,
      assetId: petr4.id,
      type: 'BUY',
      currency: 'BRL',
      tradeDate: new Date('2026-01-10T00:00:00.000Z'),
      quantity: '100.000000000000000000',
      unitPrice: '38.500000000000000000',
      fees: '2.500000000000000000',
      source: 'MANUAL',
      provider: 'SEED',
      externalId: 'TX-SEED-002',
      notes: 'Buy PETR4 on B3',
    },
  });

  const seedTx3 = await prisma.transaction.upsert({
    where: {
      portfolio_provider_external_id_unique: {
        portfolioId: portfolio.id,
        provider: 'SEED',
        externalId: 'TX-SEED-003',
      },
    },
    update: {},
    create: {
      id: 'f0000000-0000-4000-8000-000000000003',
      portfolioId: portfolio.id,
      accountId: xpAccount.id,
      assetId: vale3.id,
      type: 'BUY',
      currency: 'BRL',
      tradeDate: new Date('2026-01-15T00:00:00.000Z'),
      quantity: '50.000000000000000000',
      unitPrice: '62.100000000000000000',
      fees: '1.800000000000000000',
      source: 'MANUAL',
      provider: 'SEED',
      externalId: 'TX-SEED-003',
      notes: 'Buy VALE3 on B3',
    },
  });

  const seedTx4 = await prisma.transaction.upsert({
    where: {
      portfolio_provider_external_id_unique: {
        portfolioId: portfolio.id,
        provider: 'SEED',
        externalId: 'TX-SEED-004',
      },
    },
    update: {},
    create: {
      id: 'f0000000-0000-4000-8000-000000000004',
      portfolioId: portfolio.id,
      accountId: nuAccount.id,
      assetId: hglg11.id,
      type: 'BUY',
      currency: 'BRL',
      tradeDate: new Date('2026-01-20T00:00:00.000Z'),
      quantity: '20.000000000000000000',
      unitPrice: '165.000000000000000000',
      source: 'MANUAL',
      provider: 'SEED',
      externalId: 'TX-SEED-004',
      notes: 'Buy HGLG11 on B3',
    },
  });

  const seedTx5 = await prisma.transaction.upsert({
    where: {
      portfolio_provider_external_id_unique: {
        portfolioId: portfolio.id,
        provider: 'SEED',
        externalId: 'TX-SEED-005',
      },
    },
    update: {},
    create: {
      id: 'f0000000-0000-4000-8000-000000000005',
      portfolioId: portfolio.id,
      accountId: xpAccount.id,
      assetId: petr4.id,
      type: 'DIVIDEND',
      currency: 'BRL',
      tradeDate: new Date('2026-02-15T00:00:00.000Z'),
      amount: '125.000000000000000000',
      source: 'MANUAL',
      provider: 'SEED',
      externalId: 'TX-SEED-005',
      notes: 'Dividend payout PETR4',
    },
  });

  console.info(
    `Transactions seeded: ${seedTx1.id}, ${seedTx2.id}, ${seedTx3.id}, ${seedTx4.id}, ${seedTx5.id}`,
  );
  console.info('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
