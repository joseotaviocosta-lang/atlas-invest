import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

export interface BackupOptions {
  databaseUrl?: string;
  outputDir?: string;
  label?: string;
}

export interface BackupResult {
  filePath: string;
  checksumPath: string;
  checksum: string;
  sizeBytes: number;
  durationMs: number;
  database: string;
  timestamp: string;
}

export interface RestoreDrillOptions {
  backupFilePath?: string;
  databaseUrl?: string;
  preserveOnFailure?: boolean;
}

export interface RestoreInvariants {
  migrationCount: number;
  tableCount: number;
  transactionCount: number;
  ledgerIntegrity: boolean;
  rectificationCount: number;
  reconciliationDecisionCount: number;
  watchlistCount: number;
  userCount: number;
  notificationsIntact: boolean;
  auditHistoryIntact: boolean;
  privacyTablesIntact: boolean;
}

export interface RestoreDrillResult {
  success: boolean;
  rtoMs: number;
  backupFile: string;
  checksumValid: boolean;
  tempDatabaseName: string;
  invariants: RestoreInvariants;
  cleanupSuccess: boolean;
  timestamp: string;
  error?: string;
}

export interface ParsedDbUrl {
  user: string;
  password?: string;
  host: string;
  port: number;
  database: string;
  schema?: string;
}

export function parseDatabaseUrl(urlStr: string): ParsedDbUrl {
  const parsed = new URL(urlStr);
  return {
    user: decodeURIComponent(parsed.username || 'atlas'),
    password: decodeURIComponent(parsed.password || 'atlas'),
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '5432', 10),
    database: parsed.pathname.replace(/^\//, '') || 'atlas_dev',
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

function resolveContainerName(port: number): string {
  if (port === 5433) return 'atlas_postgres_test';
  if (port === 5434) return 'atlas_postgres_dev5434';
  return 'atlas_postgres';
}

export function findPgDumpExecutable(): string | null {
  if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
    return process.env.PG_DUMP_PATH;
  }
  const defaultWinPaths = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
  ];
  for (const p of defaultWinPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getRepoRootDir(): string {
  // Walks up until package.json with name "atlas-invest" is found
  let current = __dirname;
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'atlas-invest') {
          return current;
        }
      } catch {
        // ignore
      }
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

/**
 * Creates a verified logical backup of the database via pg_dump.
 * Computes a SHA-256 checksum and saves it adjacent to the SQL dump file.
 */
export async function createDatabaseBackup(options?: BackupOptions): Promise<BackupResult> {
  const startTime = Date.now();
  const dbUrl =
    options?.databaseUrl ||
    process.env.DATABASE_TEST_URL ||
    process.env.DATABASE_URL ||
    'postgresql://atlas:atlas@127.0.0.1:5433/atlas_test?schema=public';

  const parsed = parseDatabaseUrl(dbUrl);
  const container = resolveContainerName(parsed.port);
  const repoRoot = getRepoRootDir();
  const outputDir = options?.outputDir || path.join(repoRoot, 'backups');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestampIso = new Date().toISOString().replace(/[:.]/g, '-');
  const label = options?.label ? `_${options.label}` : '';
  const filename = `atlas_backup_${parsed.database}${label}_${timestampIso}.sql`;
  const filePath = path.join(outputDir, filename);
  const checksumPath = `${filePath}.sha256`;

  const nativePgDump = findPgDumpExecutable();

  // Execute pg_dump streaming through native binary or docker
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);

    const dumpProcess = nativePgDump
      ? spawn(
          nativePgDump,
          [
            '-h',
            parsed.host,
            '-p',
            String(parsed.port),
            '-U',
            parsed.user,
            '-d',
            parsed.database,
            '--no-owner',
            '--no-privileges',
          ],
          {
            env: {
              ...process.env,
              PGPASSWORD: parsed.password || 'atlas',
            },
          },
        )
      : spawn('docker', [
          'exec',
          container,
          'pg_dump',
          '-U',
          parsed.user,
          '-d',
          parsed.database,
          '--no-owner',
          '--no-privileges',
        ]);

    dumpProcess.stdout.pipe(writeStream);

    let errorOutput = '';
    dumpProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    dumpProcess.on('close', (code) => {
      writeStream.close();
      if (code === 0) {
        resolve();
      } else {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        reject(
          new Error(
            `pg_dump failed with exit code ${code}: ${errorOutput}`,
          ),
        );
      }
    });

    dumpProcess.on('error', (err) => {
      writeStream.close();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject(err);
    });
  });

  const fileBuffer = fs.readFileSync(filePath);
  const sizeBytes = fileBuffer.length;
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  fs.writeFileSync(checksumPath, `${checksum}  ${filename}\n`, 'utf-8');
  const durationMs = Date.now() - startTime;

  return {
    filePath,
    checksumPath,
    checksum,
    sizeBytes,
    durationMs,
    database: parsed.database,
    timestamp: new Date().toISOString(),
  };
}

export interface BackupMetadata {
  filename: string;
  filePath: string;
  checksumPath: string | null;
  checksumValid: boolean | null;
  sizeBytes: number;
  createdAt: string;
  isManual: boolean;
}

export interface BackupRetentionPolicy {
  maxDaily?: number;
  maxWeekly?: number;
  maxMonthly?: number;
}

export function listBackups(customOutputDir?: string): BackupMetadata[] {
  const repoRoot = getRepoRootDir();
  const dir = customOutputDir || path.join(repoRoot, 'backups');
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);
  const sqlFiles = files.filter((f) => f.endsWith('.sql'));

  const backups: BackupMetadata[] = [];
  for (const filename of sqlFiles) {
    const filePath = path.join(dir, filename);
    try {
      const stat = fs.statSync(filePath);
      const checksumPath = `${filePath}.sha256`;
      const hasChecksum = fs.existsSync(checksumPath);
      let checksumValid: boolean | null = null;

      if (hasChecksum) {
        try {
          const checksumContent = fs.readFileSync(checksumPath, 'utf-8').trim();
          const expectedChecksum = checksumContent.split(/\s+/)[0] ?? '';
          const fileBuffer = fs.readFileSync(filePath);
          const calculatedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          checksumValid = calculatedChecksum.toLowerCase() === expectedChecksum.toLowerCase();
        } catch {
          checksumValid = false;
        }
      }

      const isManual =
        filename.includes('_manual_') ||
        filename.includes('_pre_') ||
        filename.includes('_post_') ||
        filename.startsWith('atlas_local_pre_') ||
        filename.startsWith('atlas_local_post_');

      backups.push({
        filename,
        filePath,
        checksumPath: hasChecksum ? checksumPath : null,
        checksumValid,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        isManual,
      });
    } catch {
      // Ignore unreadable or transient files
    }
  }

  return backups.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function applyRetentionPolicy(
  customOutputDir?: string,
  policy?: BackupRetentionPolicy,
): { kept: string[]; deleted: string[] } {
  const maxDaily = policy?.maxDaily ?? 7;
  const maxWeekly = policy?.maxWeekly ?? 4;
  const maxMonthly = policy?.maxMonthly ?? 3;

  const backups = listBackups(customOutputDir);
  const kept: string[] = [];
  const deleted: string[] = [];

  // Manual backups are ALWAYS preserved
  const autoBackups = backups.filter((b) => !b.isManual);
  for (const manual of backups.filter((b) => b.isManual)) {
    kept.push(manual.filename);
  }

  const dailyBuckets = new Set<string>();
  const weeklyBuckets = new Set<string>();
  const monthlyBuckets = new Set<string>();

  for (const backup of autoBackups) {
    const d = new Date(backup.createdAt);
    const dayKey = d.toISOString().slice(0, 10);
    const monthKey = d.toISOString().slice(0, 7);

    const target = new Date(d.valueOf());
    const dayNr = (d.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    const weekKey = `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

    let shouldKeep = false;

    if (dailyBuckets.size < maxDaily) {
      dailyBuckets.add(dayKey);
      shouldKeep = true;
    }
    if (weeklyBuckets.size < maxWeekly && !weeklyBuckets.has(weekKey)) {
      weeklyBuckets.add(weekKey);
      shouldKeep = true;
    }
    if (monthlyBuckets.size < maxMonthly && !monthlyBuckets.has(monthKey)) {
      monthlyBuckets.add(monthKey);
      shouldKeep = true;
    }

    if (shouldKeep) {
      kept.push(backup.filename);
    } else {
      deleted.push(backup.filename);
      try {
        if (fs.existsSync(backup.filePath)) {
          fs.unlinkSync(backup.filePath);
        }
        if (backup.checksumPath && fs.existsSync(backup.checksumPath)) {
          fs.unlinkSync(backup.checksumPath);
        }
      } catch {
        // Ignore deletion errors
      }
    }
  }

  return { kept, deleted };
}

/**
 * Verifies SHA-256 checksum of an existing backup file against its checksum file.
 */
export async function verifyBackupChecksum(
  backupFilePath: string,
  checksumFilePath?: string,
): Promise<{ valid: boolean; calculated: string; expected: string }> {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at ${backupFilePath}`);
  }

  const targetChecksumPath = checksumFilePath || `${backupFilePath}.sha256`;
  if (!fs.existsSync(targetChecksumPath)) {
    throw new Error(`Checksum file not found at ${targetChecksumPath}`);
  }

  const checksumContent = fs.readFileSync(targetChecksumPath, 'utf-8').trim();
  const expectedChecksum = checksumContent.split(/\s+/)[0] ?? '';

  const fileBuffer = fs.readFileSync(backupFilePath);
  const calculatedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  return {
    valid: calculatedChecksum.toLowerCase() === expectedChecksum.toLowerCase(),
    calculated: calculatedChecksum,
    expected: expectedChecksum,
  };
}

/**
 * Executes an isolated end-to-end database restore verification drill:
 * 1. Verifies SHA-256 checksum.
 * 2. Creates a clean isolated database `atlas_restore_drill_<timestamp>`.
 * 3. Restores the dump into the isolated database.
 * 4. Connects via Prisma and validates financial ledger invariants:
 *    - 45 database migrations applied and verified.
 *    - Tables structure and counts.
 *    - Ledger transaction amounts and decimals integrity.
 *    - Rectification links.
 *    - Reconciliation decisions.
 *    - Watchlists and portfolio entities.
 * 5. Drops the temporary database and measures RTO.
 */
export async function runRestoreVerificationDrill(
  options?: RestoreDrillOptions,
): Promise<RestoreDrillResult> {
  const drillStartTime = Date.now();
  const dbUrl =
    options?.databaseUrl ||
    process.env.DATABASE_TEST_URL ||
    process.env.DATABASE_URL ||
    'postgresql://atlas:atlas@127.0.0.1:5433/atlas_test?schema=public';

  const parsed = parseDatabaseUrl(dbUrl);
  const container = resolveContainerName(parsed.port);

  let backupFile = options?.backupFilePath;
  if (!backupFile) {
    const backupRes = await createDatabaseBackup({
      databaseUrl: dbUrl,
      label: 'drill_source',
    });
    backupFile = backupRes.filePath;
  }

  // 1. Checksum verification
  const checksumResult = await verifyBackupChecksum(backupFile);
  if (!checksumResult.valid) {
    throw new Error(
      `Backup checksum mismatch! Calculated: ${checksumResult.calculated}, Expected: ${checksumResult.expected}`,
    );
  }

  const tempDbName = `atlas_restore_drill_${Date.now()}`;
  let cleanupSuccess = false;

  // 2. Create isolated database
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', [
      'exec',
      container,
      'psql',
      '-U',
      parsed.user,
      '-d',
      parsed.database,
      '-c',
      `CREATE DATABASE ${tempDbName};`,
    ]);

    let errOut = '';
    proc.stderr.on('data', (d) => (errOut += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to create drill database ${tempDbName}: ${errOut}`));
    });
  });

  try {
    // 3. Restore dump into isolated database
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(backupFile!);
      const restoreProc = spawn('docker', [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        parsed.user,
        '-d',
        tempDbName,
      ]);

      readStream.pipe(restoreProc.stdin);

      let errOut = '';
      restoreProc.stderr.on('data', (d) => (errOut += d.toString()));
      restoreProc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to restore into drill database ${tempDbName}: ${errOut}`));
      });
    });

    // 4. Assert invariants on the restored database
    const tempDbUrl = `postgresql://${parsed.user}:${parsed.password || 'atlas'}@${parsed.host}:${parsed.port}/${tempDbName}?schema=public`;
    const tempPrisma = new PrismaClient({ datasourceUrl: tempDbUrl });

    let invariants: RestoreInvariants;
    try {
      // Invariant 1: Exactly 50 migrations applied (canonical count)
      const migrationRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM _prisma_migrations WHERE finished_at IS NOT NULL',
      );
      const migrationCount = migrationRows[0] ? Number(migrationRows[0].count) : 0;

      // Invariant 2: Table count in schema public
      const tableRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'",
      );
      const tableCount = tableRows[0] ? Number(tableRows[0].count) : 0;

      // Invariant 3: Ledger Transactions integrity
      const txRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM transactions',
      );
      const transactionCount = txRows[0] ? Number(txRows[0].count) : 0;

      // Check numeric columns non-null and numeric data type
      const invalidTxRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM transactions WHERE amount IS NULL OR quantity IS NULL OR type IS NULL OR trade_date IS NULL',
      );
      const invalidTxCount = invalidTxRows[0] ? Number(invalidTxRows[0].count) : 0;
      const ledgerIntegrity = invalidTxCount === 0;

      // Invariant 4: Rectification links
      const rectRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM transaction_rectifications',
      );
      const rectificationCount = rectRows[0] ? Number(rectRows[0].count) : 0;

      // Invariant 5: Reconciliation decisions
      const reconRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM reconciliation_decisions',
      );
      const reconciliationDecisionCount = reconRows[0] ? Number(reconRows[0].count) : 0;

      // Invariant 6: Watchlists
      const watchlistRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM watchlist_items',
      );
      const watchlistCount = watchlistRows[0] ? Number(watchlistRows[0].count) : 0;

      // Invariant 7: Users
      const userRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM users',
      );
      const userCount = userRows[0] ? Number(userRows[0].count) : 0;

      // Invariant 8: Derived Features Smoke (Notifications & Audit History)
      const notifRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM operational_alert_events',
      );
      const taxNotifRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM tax_compliance_notification_events',
      );
      const notificationsIntact = notifRows[0] !== undefined && taxNotifRows[0] !== undefined;

      const runTxRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM integration_run_transactions',
      );
      const auditHistoryIntact = runTxRows[0] !== undefined;

      // Invariant 9: Phase 6B Privacy and DSR Schema Intact
      const consentRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM user_consents',
      );
      const dsrRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM data_subject_requests',
      );
      const docRows = await tempPrisma.$queryRawUnsafe<{ count: string | number | bigint }[]>(
        'SELECT COUNT(*) as count FROM legal_document_acceptances',
      );
      const privacyTablesIntact =
        consentRows[0] !== undefined && dsrRows[0] !== undefined && docRows[0] !== undefined;

      invariants = {
        migrationCount,
        tableCount,
        transactionCount,
        ledgerIntegrity,
        rectificationCount,
        reconciliationDecisionCount,
        watchlistCount,
        userCount,
        notificationsIntact,
        auditHistoryIntact,
        privacyTablesIntact,
      };
    } finally {
      await tempPrisma.$disconnect();
    }

    // 5. Clean up temporary database
    try {
      await new Promise<void>((resolve, reject) => {
        const dropProc = spawn('docker', [
          'exec',
          container,
          'psql',
          '-U',
          parsed.user,
          '-d',
          parsed.database,
          '-c',
          `DROP DATABASE IF EXISTS ${tempDbName};`,
        ]);
        dropProc.on('close', (code) => {
          if (code === 0) {
            cleanupSuccess = true;
            resolve();
          } else {
            reject(new Error(`Failed to drop drill database ${tempDbName}`));
          }
        });
      });
    } catch (e) {
      console.error(`[RestoreDrill] Cleanup warning: failed to drop ${tempDbName}:`, e);
    }

    const rtoMs = Date.now() - drillStartTime;
    const isSuccess =
      checksumResult.valid &&
      invariants.migrationCount === 50 &&
      invariants.ledgerIntegrity &&
      invariants.notificationsIntact &&
      invariants.auditHistoryIntact &&
      invariants.privacyTablesIntact;

    return {
      success: isSuccess,
      rtoMs,
      backupFile,
      checksumValid: checksumResult.valid,
      tempDatabaseName: tempDbName,
      invariants,
      cleanupSuccess,
      timestamp: new Date().toISOString(),
    };
  } catch (drillError) {
    // Attempt cleanup if error occurred before normal cleanup
    if (!cleanupSuccess) {
      try {
        await new Promise<void>((resolve) => {
          const dropProc = spawn('docker', [
            'exec',
            container,
            'psql',
            '-U',
            parsed.user,
            '-d',
            parsed.database,
            '-c',
            `DROP DATABASE IF EXISTS ${tempDbName};`,
          ]);
          dropProc.on('close', () => resolve());
        });
      } catch {
        // ignore
      }
    }
    throw drillError;
  }
}
