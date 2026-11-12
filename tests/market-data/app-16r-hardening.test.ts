import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLOSED_APP_MONITOR_EXIT_CODES,
  checkBundleVersionCoherence,
  readClosedAppPreferences,
  sanitizeMonitorText,
  writeClosedAppStatus,
} from '../../apps/api/src/background-news-monitor';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-16r-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('APP-16R Closed-App Monitor Hardening (TypeScript layer)', () => {
  it('exposes exit code 60 for runtime version mismatch and checks bundle coherence', () => {
    expect(CLOSED_APP_MONITOR_EXIT_CODES.RUNTIME_VERSION_MISMATCH).toBe(60);
    expect(checkBundleVersionCoherence('0.1.0-pilot.1+abc123', '0.1.0-pilot.1+abc123')).toEqual({
      ok: true,
      reason: null,
    });

    const mismatch = checkBundleVersionCoherence('0.1.0-pilot.1+old', '0.1.0-pilot.1+new');
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reason).toContain('incompatível');
  });

  it('fails closed (closedAppNewsMonitoring=false) when news-monitor-prefs.json is corrupted', () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, 'news-monitor-prefs.json'), '{corrupted-json:::', 'utf-8');
    const prefs = readClosedAppPreferences(dir);
    expect(prefs.closedAppNewsMonitoring).toBe(false);
  });

  it('writes news-monitor-status.json atomically without leaving temporary files', () => {
    const dir = createTempDir();
    writeClosedAppStatus(
      {
        lastRunAt: '2026-11-12T10:00:00.000Z',
        lastRefreshedAt: '2026-11-12T10:00:00.000Z',
        exitCode: 0,
        status: 'SUCCESS',
        auditedAssets: 36,
        eventsCount: 331,
        deliveredAlertsCount: 0,
        suppressedQuietHoursCount: 0,
        startedPostgres: false,
        durationMs: 1200,
        atlasVersion: '0.1.0-pilot.1',
        monitorVersion: '0.1.0',
        providersUsed: ['CVM'],
        officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
        cvmStatus: 'AVAILABLE',
        fnetStatus: 'AVAILABLE',
        error: null,
      },
      dir,
    );

    const files = fs.readdirSync(dir);
    expect(files).toEqual(['news-monitor-status.json']);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'news-monitor-status.json'), 'utf-8'));
    expect(parsed.status).toBe('SUCCESS');
    expect(parsed.auditedAssets).toBe(36);
  });

  it('redacts Bearer, BRAPI, postgres URI, JWT, password, and query-param secrets from logs', () => {
    const synthetic = [
      'Authorization: Bearer super_secret_token_123',
      'BRAPI_API_KEY=brapi_live_xyz987',
      'DATABASE_URL=postgresql://atlas:mySecretPass@127.0.0.1:5434/atlas_local',
      'jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signaturePart',
      'https://brapi.dev/api/quote/PETR4?token=abc123&api_key=xyz789',
      'password=TopSecretPassword!',
    ].join(' ');

    const redacted = sanitizeMonitorText(synthetic);
    expect(redacted).not.toContain('super_secret_token_123');
    expect(redacted).not.toContain('brapi_live_xyz987');
    expect(redacted).not.toContain('mySecretPass');
    expect(redacted).not.toContain('signaturePart');
    expect(redacted).not.toContain('abc123');
    expect(redacted).not.toContain('xyz789');
    expect(redacted).not.toContain('TopSecretPassword');
    expect(redacted).toContain('[REDACTED]');
  });
});
