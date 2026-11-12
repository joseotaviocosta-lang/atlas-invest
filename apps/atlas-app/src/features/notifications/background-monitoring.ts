import type { NewsMonitoringIntervalMinutes, NotificationPreferences } from './types';

export interface ClosedAppTaskStatus {
  installed: boolean;
  enabled: boolean;
  taskName: string;
  intervalMinutes: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastTaskResult: number | null;
  needsRepair: boolean;
  commandPath?: string | null;
  expectedCommandPath?: string | null;
  runtimeHealthy?: boolean;
  runtimeIssue?: string | null;
  repairReasons?: string[];
}

export interface ClosedAppExecutionStatus {
  lastRunAt: string;
  lastRefreshedAt: string | null;
  exitCode: number;
  status: string;
  auditedAssets: number;
  eventsCount: number;
  deliveredAlertsCount: number;
  suppressedQuietHoursCount: number;
  startedPostgres: boolean;
  durationMs: number;
  atlasVersion: string;
  monitorVersion: string;
  providersUsed: string[];
  officialStatus: string | null;
  cvmStatus: string | null;
  fnetStatus: string | null;
  error: string | null;
}

export interface ClosedAppMonitoringDiagnostics {
  task: ClosedAppTaskStatus;
  lastExecution: ClosedAppExecutionStatus | null;
  atlasVersion: string | null;
  buildId?: string | null;
}

function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
      (window as unknown as { __TAURI__?: unknown }).__TAURI__,
  );
}

/**
 * Serializes ONLY non-secret notification preferences for the closed-app monitor.
 * Zero tokens, zero holdings, zero patrimonial balances.
 */
export function serializeBackgroundMonitorPrefs(prefs: NotificationPreferences): string {
  return JSON.stringify({
    enabled: prefs.enabled,
    materialNewsAlerts: prefs.materialNewsAlerts,
    materialNewsThreshold: prefs.materialNewsThreshold,
    materialNewsAlertsActivatedAt: prefs.materialNewsAlertsActivatedAt ?? null,
    closedAppNewsMonitoring: prefs.closedAppNewsMonitoring,
    newsMonitoringIntervalMinutes: prefs.newsMonitoringIntervalMinutes,
    quietHoursEnabled: prefs.quietHoursEnabled,
    quietHoursStart: prefs.quietHoursStart,
    quietHoursEnd: prefs.quietHoursEnd,
    maxDailyNotifications: prefs.maxDailyNotifications,
    cooldownHours: prefs.cooldownHours,
  });
}

export async function syncClosedAppMonitoringPreferences(
  prefs: NotificationPreferences,
): Promise<ClosedAppTaskStatus | null> {
  if (!isTauriEnvironment()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ClosedAppTaskStatus>('background_monitor_sync', {
    prefsJson: serializeBackgroundMonitorPrefs(prefs),
  });
}

export async function getClosedAppMonitoringStatus(
  expectedEnabled: boolean,
  expectedInterval: NewsMonitoringIntervalMinutes,
): Promise<ClosedAppMonitoringDiagnostics | null> {
  if (!isTauriEnvironment()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ClosedAppMonitoringDiagnostics>('background_monitor_status', {
    expectedEnabled,
    expectedInterval,
  });
}

export async function repairClosedAppMonitoringTask(
  intervalMinutes: NewsMonitoringIntervalMinutes,
): Promise<ClosedAppTaskStatus | null> {
  if (!isTauriEnvironment()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ClosedAppTaskStatus>('background_monitor_repair', {
    intervalMinutes,
  });
}
