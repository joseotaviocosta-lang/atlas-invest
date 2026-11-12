/**
 * Local-First Smart Notifications & Fiscal Reminders (APP-13)
 * STRICT SECURITY INVARIANT: Zero sensitive financial balances on lock screen.
 * Zero tokens, zero credentials in notification payloads.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'prompt';

export type NotificationCategory =
  | 'FISCAL_DARF'
  | 'FISCAL_EVIDENCE'
  | 'FISCAL_BLOCKED'
  | 'RECONCILIATION_REVIEW'
  | 'MATERIAL_NEWS'
  | 'SYSTEM_TEST';

export type MaterialNewsAlertThreshold = 'CRITICAL_ONLY' | 'HIGH_AND_CRITICAL' | 'ALL_MATERIAL';

export type NewsMonitoringIntervalMinutes = 15 | 30 | 60;

export type PortfolioNewsMonitoringStatus =
  | 'ENABLED'
  | 'DISABLED'
  | 'PAUSED_QUIET_HOURS'
  | 'PAUSED_OFFLINE'
  | 'PAUSED_NO_PORTFOLIO';

export type NewsRefreshSource =
  | 'MANUAL'
  | 'AUTOMATIC_INTERVAL'
  | 'FOREGROUND_RESUME'
  | 'RECOVERY';

export interface PortfolioNewsMonitoringDiagnostics {
  status: PortfolioNewsMonitoringStatus;
  monitoringEnabled: boolean;
  intervalMinutes: NewsMonitoringIntervalMinutes;
  portfolioId: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastSuccessfulAutomaticRefreshAt: string | null;
  lastAutomaticRefreshAttemptAt: string | null;
  nextScheduledAt: string | null;
  inFlight: boolean;
  quietHours: {
    enabled: boolean;
    active: boolean;
    start: string;
    end: string;
    policy: 'REFRESH_CONTINUES_ALERTS_SUPPRESSED';
    criticalBypassesQuietHours: false;
    highDeferralWindowHours: number;
  };
  lastTrigger: NewsRefreshSource | null;
  consecutiveFailures: number;
  backoffUntilAt: string | null;
  lastCycleDurationMs: number | null;
  lastError: string | null;
  overlapSkips: number;
  automaticCyclesCompleted: number;
  networkFailures: number;
}

export type NotificationSeverity = 'HIGH' | 'NORMAL' | 'LOW';

export interface LocalNotification {
  id: string; // Deterministic identity key
  numericId?: number; // 32-bit integer for OS notification ID
  title: string;
  body: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  deepLink?: string; // App route (e.g. '/tax', '/import', '/portfolio')
  scheduledAt?: number;
  createdAt: number;
  data?: Record<string, string | number | boolean>;
}

export interface NotificationPreferences {
  enabled: boolean;
  fiscalReminders: boolean;
  darfReminders: boolean;
  costEvidenceAlerts: boolean;
  reconciliationAlerts: boolean;
  portfolioSummaryAlerts: boolean;
  materialNewsAlerts: boolean;
  materialNewsThreshold: MaterialNewsAlertThreshold;
  materialNewsAlertsActivatedAt?: string | null;
  automaticNewsMonitoring: boolean;
  newsMonitoringIntervalMinutes: NewsMonitoringIntervalMinutes;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm format, default '22:00'
  quietHoursEnd: string; // HH:mm format, default '08:00'
  maxDailyNotifications: number; // default: 5
  cooldownHours: number; // default: 6
}

export interface NotificationHistoryItem {
  id: string;
  notification: LocalNotification;
  read: boolean;
  receivedAt: number;
}

export interface NotificationService {
  isSupported(): boolean;
  requestPermission(): Promise<NotificationPermissionState>;
  getPermissionState(): Promise<NotificationPermissionState>;
  send(notification: LocalNotification): Promise<boolean>;
  schedule(notification: LocalNotification): Promise<boolean>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
}
