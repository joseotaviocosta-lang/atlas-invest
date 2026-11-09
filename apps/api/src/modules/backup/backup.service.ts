import { Injectable, Logger } from '@nestjs/common';
import path from 'node:path';
import fs from 'node:fs';
import {
  createDatabaseBackup,
  listBackups,
  applyRetentionPolicy,
  type BackupMetadata,
  type BackupResult,
} from '@atlas/database';

export interface BackupStatusResponse {
  lastBackup: BackupMetadata | null;
  totalBackups: number;
  backupDir: string;
  backups: BackupMetadata[];
  retentionSummary: {
    maxDaily: number;
    maxWeekly: number;
    maxMonthly: number;
  };
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  private getBackupDir(): string {
    if (process.env.ATLAS_BACKUP_DIR) {
      return process.env.ATLAS_BACKUP_DIR;
    }
    // Check if running from local app or repo
    const repoRoot = process.cwd();
    const defaultDir = path.join(repoRoot, 'backups');
    if (!fs.existsSync(defaultDir)) {
      try {
        fs.mkdirSync(defaultDir, { recursive: true });
      } catch {
        // ignore
      }
    }
    return defaultDir;
  }

  async getStatus(): Promise<BackupStatusResponse> {
    const backupDir = this.getBackupDir();
    const backups = listBackups(backupDir);

    return {
      lastBackup: backups[0] ?? null,
      totalBackups: backups.length,
      backupDir,
      backups: backups.slice(0, 10),
      retentionSummary: {
        maxDaily: 7,
        maxWeekly: 4,
        maxMonthly: 3,
      },
    };
  }

  async createBackup(): Promise<{ result: BackupResult; status: BackupStatusResponse }> {
    const backupDir = this.getBackupDir();
    const dbUrl = process.env.DATABASE_URL;

    this.logger.log(`Starting manual verified database backup to ${backupDir}...`);
    const result = await createDatabaseBackup({
      databaseUrl: dbUrl,
      outputDir: backupDir,
      label: 'manual',
    });

    // Apply retention policy (preserves manual backups, keeps 7 daily, 4 weekly, 3 monthly)
    const retention = applyRetentionPolicy(backupDir, {
      maxDaily: 7,
      maxWeekly: 4,
      maxMonthly: 3,
    });

    this.logger.log(
      `Backup completed successfully: ${result.filePath} (${result.sizeBytes} bytes, checksum: ${result.checksum.slice(0, 8)}...). Retention kept ${retention.kept.length}, purged ${retention.deleted.length}.`,
    );

    const status = await this.getStatus();
    return { result, status };
  }
}
