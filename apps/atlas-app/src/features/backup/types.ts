export interface BackupMetadata {
  filename: string;
  filePath: string;
  checksumPath: string | null;
  checksumValid: boolean | null;
  sizeBytes: number;
  createdAt: string;
  isManual: boolean;
}

export interface BackupStatus {
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

export interface CreateBackupResponse {
  result: {
    filePath: string;
    checksumPath: string;
    checksum: string;
    sizeBytes: number;
    durationMs: number;
    database: string;
    timestamp: string;
  };
  status: BackupStatus;
}
