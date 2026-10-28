import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createDatabaseBackup,
  verifyBackupChecksum,
  runRestoreVerificationDrill,
} from '@atlas/database';

describe('Phase 6A: Database Backup & Isolated Restore Drill Invariants', () => {
  it('creates a verified database backup with SHA-256 checksum and non-empty schema/data', async () => {
    const result = await createDatabaseBackup({
      label: 'test_phase6a',
    });

    expect(result.filePath).toBeDefined();
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.checksumPath).toBeDefined();
    expect(fs.existsSync(result.checksumPath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(50 * 1024); // at least 50KB schema/data
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/i);
    expect(result.durationMs).toBeGreaterThan(0);

    // Verify file content starts with standard Postgres header
    const sample = fs.readFileSync(result.filePath, 'utf-8').slice(0, 200);
    expect(sample).toContain('PostgreSQL database dump');
  }, 30000);

  it('validates checksum integrity and detects tamper or corruption in backup blob', async () => {
    const backup = await createDatabaseBackup({ label: 'tamper_test' });

    // Untampered
    const validCheck = await verifyBackupChecksum(backup.filePath);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.calculated).toBe(validCheck.expected);

    // Simulated corruption in temporary copy
    const tamperedPath = `${backup.filePath}.tampered.sql`;
    const originalContent = fs.readFileSync(backup.filePath);
    fs.writeFileSync(
      tamperedPath,
      Buffer.concat([originalContent, Buffer.from('-- CORRUPTION\n')]),
    );
    const tamperedChecksumPath = `${tamperedPath}.sha256`;
    fs.writeFileSync(tamperedChecksumPath, `${backup.checksum}  ${path.basename(tamperedPath)}\n`);

    try {
      const corruptedCheck = await verifyBackupChecksum(tamperedPath, tamperedChecksumPath);
      expect(corruptedCheck.valid).toBe(false);
      expect(corruptedCheck.calculated).not.toBe(corruptedCheck.expected);
    } finally {
      if (fs.existsSync(tamperedPath)) fs.unlinkSync(tamperedPath);
      if (fs.existsSync(tamperedChecksumPath)) fs.unlinkSync(tamperedChecksumPath);
    }
  }, 30000);

  it('executes full restore drill to isolated temporary database and verifies all ledger & schema invariants', async () => {
    const drill = await runRestoreVerificationDrill();

    expect(drill.success).toBe(true);
    expect(drill.checksumValid).toBe(true);
    expect(drill.rtoMs).toBeLessThan(30000); // RTO strictly within 30 seconds
    expect(drill.cleanupSuccess).toBe(true); // Isolated temporary DB dropped cleanly

    // Assert Domain & Ledger Invariants
    expect(drill.invariants.migrationCount).toBe(44);
    expect(drill.invariants.tableCount).toBe(61);
    expect(drill.invariants.ledgerIntegrity).toBe(true);
    expect(drill.invariants.userCount).toBeGreaterThanOrEqual(1);
    expect(drill.invariants.notificationsIntact).toBe(true);
    expect(drill.invariants.auditHistoryIntact).toBe(true);
  }, 60000);
});
