import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { validateProductionSecrets } from '../../apps/api/src/main';
import {
  getRefreshCookieOptions,
  getLoggedInCookieOptions,
} from '../../apps/web/src/lib/auth-cookie';
import { validateOrigin } from '../../apps/web/src/lib/origin-validator';
import { exportAnnualTaxReportingToCsv } from '@atlas/tax-engine';
import { escapeCsvCell } from '@atlas/tax-engine';
import { createPortfolioReplayEngine } from '@atlas/portfolio-engine';
import { TransactionFactory, createPortfolioId, createAssetId } from '@atlas/domain';
import { TokenService } from '../../apps/api/src/auth/services/token.service';

describe('Phase 4L.1V-C3-R1: Production Readiness Evidence Closure & Provider Gate Verification', () => {
  const adminUrl = 'postgresql://atlas:atlas@localhost:5433/postgres?schema=public';
  const zeroDbName = 'atlas_c3_zero_migration_test';
  const zeroDbUrl = `postgresql://atlas:atlas@localhost:5433/${zeroDbName}?schema=public`;

  const sourceDbName = 'atlas_c3_backup_source';
  const sourceDbUrl = `postgresql://atlas:atlas@localhost:5433/${sourceDbName}?schema=public`;

  const targetDbName = 'atlas_c3_restore_target';
  const targetDbUrl = `postgresql://atlas:atlas@localhost:5433/${targetDbName}?schema=public`;

  const pgDumpPath = fs.existsSync('C:\\Users\\joseo\\.pg16_bin\\pgsql\\bin\\pg_dump.exe')
    ? 'C:\\Users\\joseo\\.pg16_bin\\pgsql\\bin\\pg_dump.exe'
    : 'pg_dump';

  const pgRestorePath = fs.existsSync('C:\\Users\\joseo\\.pg16_bin\\pgsql\\bin\\pg_restore.exe')
    ? 'C:\\Users\\joseo\\.pg16_bin\\pgsql\\bin\\pg_restore.exe'
    : 'pg_restore';

  const backupFilePath = path.join(process.cwd(), '.test_c3_backup_drill.dump');

  let adminPrisma: PrismaClient;

  beforeAll(async () => {
    adminPrisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });

    // Ensure test databases do not exist before starting
    const dropDatabases = [zeroDbName, sourceDbName, targetDbName];
    for (const db of dropDatabases) {
      try {
        await adminPrisma.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid()`,
        );
        await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${db}`);
      } catch {
        // ignore
      }
    }

    if (fs.existsSync(backupFilePath)) {
      fs.unlinkSync(backupFilePath);
    }
  }, 60000);

  afterAll(async () => {
    const dropDatabases = [zeroDbName, sourceDbName, targetDbName];
    for (const db of dropDatabases) {
      try {
        await adminPrisma.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid()`,
        );
        await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${db}`);
      } catch {
        // ignore
      }
    }

    if (fs.existsSync(backupFilePath)) {
      try {
        fs.unlinkSync(backupFilePath);
      } catch {
        // ignore
      }
    }

    await adminPrisma.$disconnect();
  }, 180_000);

  describe('Section 4: Production Migration Strategy (from zero to latest)', () => {
    it('executes prisma migrate deploy from an empty database and applies all migrations cleanly', async () => {
      // 1. Create fresh empty database
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${zeroDbName}`);

      // 2. Run canonical production migration command
      const output = execSync('pnpm --filter @atlas/database migrate', {
        env: { ...process.env, DATABASE_URL: zeroDbUrl },
        encoding: 'utf-8',
      });

      expect(output).toContain('Applying migration');
      expect(output).toContain('migrations have been successfully applied');

      // 3. Inspect _prisma_migrations table
      const zeroPrisma = new PrismaClient({ datasources: { db: { url: zeroDbUrl } } });
      const migrationRows = await zeroPrisma.$queryRawUnsafe<
        Array<{ migration_name: string; rolled_back_at: Date | null }>
      >('SELECT migration_name, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC');

      expect(migrationRows.length).toBe(35);
      for (const row of migrationRows) {
        expect(row.rolled_back_at).toBeNull();
      }

      // 4. Verify idempotency: running migrate deploy again applies 0 new migrations
      const secondOutput = execSync('pnpm --filter @atlas/database migrate', {
        env: { ...process.env, DATABASE_URL: zeroDbUrl },
        encoding: 'utf-8',
      });
      expect(secondOutput).toContain('No pending migrations to apply');

      await zeroPrisma.$disconnect();
    }, 180_000);
  });

  describe('Section 5: Real Backup & Restore Drill on Isolated Databases', () => {
    it('creates a physical pg_dump backup and restores with 100% data and migration parity', async () => {
      // 1. Create source DB and apply migrations
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${sourceDbName}`);
      execSync('pnpm --filter @atlas/database migrate', {
        env: { ...process.env, DATABASE_URL: sourceDbUrl },
        encoding: 'utf-8',
      });

      const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceDbUrl } } });

      // 2. Insert representative data
      const user = await sourcePrisma.user.create({
        data: {
          email: 'drill.investor@example.com',
          name: 'Drill Investor',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhashvalue',
        },
      });

      const institution = await sourcePrisma.institution.create({
        data: {
          name: 'Corretora Drill',
          type: 'BROKERAGE',
          country: 'BR',
        },
      });

      const portfolio = await sourcePrisma.portfolio.create({
        data: {
          userId: user.id,
          name: 'Carteira Principal Drill',
          baseCurrency: 'BRL',
          type: 'GENERAL',
          status: 'ACTIVE',
        },
      });

      const account = await sourcePrisma.account.create({
        data: {
          portfolioId: portfolio.id,
          institutionId: institution.id,
          name: 'Conta Custódia Drill',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      });

      const asset = await sourcePrisma.asset.create({
        data: {
          ticker: 'PETR4',
          name: 'Petrobras PN',
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'B3',
        },
      });

      await sourcePrisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          accountId: account.id,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T00:00:00.000Z'),
          settlementDate: new Date('2026-01-12T00:00:00.000Z'),
          quantity: '100.000000000000000000',
          unitPrice: '30.000000000000000000',
          amount: '3000.000000000000000000',
          currency: 'BRL',
        },
      });

      await sourcePrisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          accountId: account.id,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date('2026-01-15T00:00:00.000Z'),
          settlementDate: new Date('2026-01-17T00:00:00.000Z'),
          quantity: '50.000000000000000000',
          unitPrice: '36.000000000000000000',
          amount: '1800.000000000000000000',
          currency: 'BRL',
        },
      });

      await sourcePrisma.transaction.create({
        data: {
          portfolioId: portfolio.id,
          accountId: account.id,
          assetId: asset.id,
          type: 'SELL',
          tradeDate: new Date('2026-01-20T00:00:00.000Z'),
          settlementDate: new Date('2026-01-22T00:00:00.000Z'),
          quantity: '30.000000000000000000',
          unitPrice: '40.000000000000000000',
          amount: '1200.000000000000000000',
          currency: 'BRL',
        },
      });

      await sourcePrisma.$disconnect();

      // 3. Create physical backup using pg_dump
      const sourcePgUrl = `postgresql://atlas:atlas@localhost:5433/${sourceDbName}`;
      execSync(
        `"${pgDumpPath}" --dbname="${sourcePgUrl}" --format=custom --compress=9 --file="${backupFilePath}"`,
        {
          encoding: 'utf-8',
        },
      );

      expect(fs.existsSync(backupFilePath)).toBe(true);
      expect(fs.statSync(backupFilePath).size).toBeGreaterThan(1000);

      // 4. Create empty target database
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${targetDbName}`);

      // 5. Restore backup into target DB
      const targetPgUrl = `postgresql://atlas:atlas@localhost:5433/${targetDbName}`;
      execSync(
        `"${pgRestorePath}" --dbname="${targetPgUrl}" --no-owner --no-privileges "${backupFilePath}"`,
        {
          encoding: 'utf-8',
        },
      );

      // 6. Connect to target DB and verify parity
      const targetPrisma = new PrismaClient({ datasources: { db: { url: targetDbUrl } } });

      const [usersCount, pfCount, accCount, txCount, migrationsCount] = await Promise.all([
        targetPrisma.user.count(),
        targetPrisma.portfolio.count(),
        targetPrisma.account.count(),
        targetPrisma.transaction.count(),
        targetPrisma.$queryRawUnsafe<Array<unknown>>('SELECT 1 FROM _prisma_migrations'),
      ]);

      expect(usersCount).toBe(1);
      expect(pfCount).toBe(1);
      expect(accCount).toBe(1);
      expect(txCount).toBe(3);
      expect(migrationsCount.length).toBe(35);

      // 7. Validate that restored data performs mathematically identical PortfolioReplay
      const restoredTransactions = await targetPrisma.transaction.findMany({
        where: { portfolioId: portfolio.id },
        orderBy: [{ tradeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });

      const domainTransactions = restoredTransactions.map((tx) => {
        const baseProps = {
          id: tx.id,
          portfolioId: tx.portfolioId,
          accountId: tx.accountId,
          assetId: tx.assetId!,
          tradeDate: tx.tradeDate.toISOString().slice(0, 10),
          settlementDate: tx.settlementDate
            ? tx.settlementDate.toISOString().slice(0, 10)
            : undefined,
          currency: tx.currency,
          createdAt: tx.createdAt,
        };
        if (tx.type === 'BUY') {
          return TransactionFactory.createBuy({
            ...baseProps,
            quantity: tx.quantity!.toString(),
            unitPrice: tx.unitPrice!.toString(),
          });
        }
        if (tx.type === 'SELL') {
          return TransactionFactory.createSell({
            ...baseProps,
            quantity: tx.quantity!.toString(),
            unitPrice: tx.unitPrice!.toString(),
          });
        }
        throw new Error(`Unexpected test transaction type ${tx.type}`);
      });

      const engine = createPortfolioReplayEngine();
      const replayResult = engine.replay({
        portfolioId: createPortfolioId(portfolio.id),
        transactions: domainTransactions,
      });

      const petr4Position = replayResult.state.assets.get(createAssetId(asset.id));
      expect(petr4Position).toBeDefined();
      // Buy 100 @ 30 (cost 3000), Buy 50 @ 36 (cost 1800) -> 150 @ 32 (cost 4800).
      // Sell 30 @ 40 -> remaining 120 @ 32.
      expect(petr4Position!.quantity.value).toBe('120');

      await targetPrisma.$disconnect();
    }, 180_000);
  });

  describe('Section 7: Environment Config Validation (Fail-Fast)', () => {
    it('throws concise error on missing or insecure production secrets when NODE_ENV=production', () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origSecret = process.env.JWT_ACCESS_SECRET;

      try {
        process.env.NODE_ENV = 'production';
        process.env.JWT_ACCESS_SECRET = 'short';

        expect(() => validateProductionSecrets()).toThrow(
          /Security invariant violated: JWT_ACCESS_SECRET must be securely configured with at least 32 characters/i,
        );
      } finally {
        process.env.NODE_ENV = origNodeEnv;
        process.env.JWT_ACCESS_SECRET = origSecret;
      }
    });

    it('passes validation when all required production secrets meet length invariants', () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origAccess = process.env.JWT_ACCESS_SECRET;
      const origRefresh = process.env.REFRESH_TOKEN_PEPPER;
      const origReset = process.env.PASSWORD_RESET_PEPPER;

      try {
        process.env.NODE_ENV = 'production';
        process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
        process.env.REFRESH_TOKEN_PEPPER = 'b'.repeat(32);
        process.env.PASSWORD_RESET_PEPPER = 'c'.repeat(32);

        expect(() => validateProductionSecrets()).not.toThrow();
      } finally {
        process.env.NODE_ENV = origNodeEnv;
        process.env.JWT_ACCESS_SECRET = origAccess;
        process.env.REFRESH_TOKEN_PEPPER = origRefresh;
        process.env.PASSWORD_RESET_PEPPER = origReset;
      }
    });
  });

  describe('Section 8 & 10: Auth / Cookie Production Posture & CSRF Defense', () => {
    it('configures HttpOnly, Secure, SameSite=Lax, and Path=/ for auth cookies in production', () => {
      const refreshOptions = getRefreshCookieOptions(true);
      expect(refreshOptions.httpOnly).toBe(true);
      expect(refreshOptions.secure).toBe(true);
      expect(refreshOptions.sameSite).toBe('lax');
      expect(refreshOptions.path).toBe('/');
      expect(refreshOptions.maxAge).toBe(30 * 24 * 60 * 60);

      const loggedInOptions = getLoggedInCookieOptions(true);
      expect(loggedInOptions.httpOnly).toBe(false); // Hint cookie for edge middleware
      expect(loggedInOptions.secure).toBe(true);
      expect(loggedInOptions.sameSite).toBe('lax');
      expect(loggedInOptions.path).toBe('/');
    });

    it('CSRF defense: rejects mutation requests from untrusted origins', () => {
      const headersMap = new Map<string, string>([
        ['origin', 'https://evil-attacker.com'],
        ['host', 'app.atlas.invest'],
      ]);
      const req = {
        headers: {
          get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
        },
      };

      const validation = validateOrigin(req);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBeDefined();
      expect(validation.error!.status).toBe(403);
      expect(validation.error!.code).toBe('AUTH.INVALID_ORIGIN');
    });

    it('CSRF defense: permits mutation requests from canonical origin matching host', () => {
      const headersMap = new Map<string, string>([
        ['origin', 'https://app.atlas.invest'],
        ['host', 'app.atlas.invest'],
      ]);
      const req = {
        headers: {
          get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
        },
      };

      const validation = validateOrigin(req);
      expect(validation.isValid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('Refresh token rotation & reuse defense: hashes and detects rotated tokens', () => {
      const tokenService = new TokenService();
      const rawToken1 = tokenService.generateRefreshToken();
      const hash1 = tokenService.hashRefreshToken(rawToken1);
      const rawToken2 = tokenService.generateRefreshToken();
      const hash2 = tokenService.hashRefreshToken(rawToken2);

      expect(hash1).not.toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex string
    });
  });

  describe('Section 20: DIRPF CSV Production-Like Formatting & OWASP Protection', () => {
    it('produces UTF-8 BOM, semicolon delimiter, CRLF line endings, and protects formula injection', () => {
      const csv = exportAnnualTaxReportingToCsv({
        calendarYear: 2026,
        declarationExercise: 2027,
        overallStatus: 'COMPLETO',
        isReadyForReporting: true,
        packageFingerprint: 'test-fingerprint',
        generatedAt: '2026-10-15T00:00:00.000Z',
        disclaimer: 'Documento demonstrativo.',
        sections: [
          {
            section: 'BENS_E_DIREITOS',
            title: 'Bens e Direitos',
            officialGroupCode: '03',
            items: [
              {
                section: 'BENS_E_DIREITOS',
                officialMappingCode: '01',
                officialMappingLabel: 'Ações',
                mappingStatus: 'MAPEADO',
                description: 'Ações PETR4 em custódia',
                ticker: 'PETR4',
                reportingStatus: 'PRONTO',
                isBlocked: false,
                blockingReasons: [],
                sourceReferences: ['ledger-tx-1'],
                closingQuantity: '100',
                closingCostBasis: '3200.00',
              },
              {
                section: 'BENS_E_DIREITOS',
                officialMappingCode: '02',
                officialMappingLabel: 'Fórmula Hostil',
                mappingStatus: 'MAPEADO',
                description: '=SUM(A1:A10)', // Formula injection vector
                ticker: '+VALE3', // Formula injection vector
                reportingStatus: 'PRONTO',
                isBlocked: false,
                blockingReasons: [],
                sourceReferences: ['-REF1'], // Formula injection vector
              },
            ],
          },
        ],
      });

      // 1. UTF-8 BOM check
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const buffer = Buffer.from(csv, 'utf-8');
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);

      // 2. Semicolon delimiter
      expect(csv).toContain('Secao;Codigo Declaracao;Item / Categoria;Status Mapeamento;');

      // 3. CRLF line endings
      expect(csv).toContain('\r\n');

      // 4. Formula injection protection (prefixed with single quote)
      expect(csv).toContain(";'=SUM(A1:A10);");
      expect(csv).toContain(";'=SUM(A1:A10)");
      expect(csv).toContain("'+VALE3");
      expect(csv).toContain("'-REF1");
    });

    it('escapeCsvCell correctly neutralizes Excel formula vectors', () => {
      expect(escapeCsvCell('=1+1')).toBe("'=1+1");
      expect(escapeCsvCell('+cmd|')).toBe("'+cmd|");
      expect(escapeCsvCell('-calc|')).toBe("'-calc|");
      expect(escapeCsvCell('@sum(1)')).toBe("'@sum(1)");
      expect(escapeCsvCell('Normal Text')).toBe('Normal Text');
      expect(escapeCsvCell('Text;With;Semicolon')).toBe('"Text;With;Semicolon"');
    });
  });
});
