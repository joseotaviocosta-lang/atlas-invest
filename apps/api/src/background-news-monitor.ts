import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NestFactory } from '@nestjs/core';
import type { IPortfolioRepository, NewsAlertDeliveryAuditItem } from '@atlas/database';
import {
  deliverMaterialNewsAlerts,
  type AlertDeliveryCoordinatorPorts,
  type NewsAlertCandidate,
  type NewsAlertDeliveryResult,
  type NewsAlertDispatchItem,
  type NewsAlertNotifier,
  type PortfolioNewsInboxResult,
} from '@atlas/market-data';
import { AppModule } from './app.module';
import { LOCAL_OWNER_USER_ID } from './auth/constants/local-owner.constants';
import { GetOpportunityRadarUseCase } from './application/portfolios/opportunity-radar';
import { PORTFOLIO_REPOSITORY } from './database/tokens';

const execFileAsync = promisify(execFile);

export const CLOSED_APP_MONITOR_EXIT_CODES = {
  SUCCESS: 0,
  SKIPPED: 10,
  OFFLINE_OR_PROVIDER_UNAVAILABLE: 20,
  LOCKED: 30,
  DEPENDENCY_FAILURE: 40,
  UNEXPECTED_FAILURE: 50,
} as const;

export type ClosedAppMonitorExitCode =
  (typeof CLOSED_APP_MONITOR_EXIT_CODES)[keyof typeof CLOSED_APP_MONITOR_EXIT_CODES];

export interface ClosedAppMonitorPreferences {
  enabled: boolean;
  materialNewsAlerts: boolean;
  materialNewsThreshold: 'CRITICAL_ONLY' | 'HIGH_AND_CRITICAL' | 'ALL_MATERIAL';
  materialNewsAlertsActivatedAt?: string | null;
  closedAppNewsMonitoring: boolean;
  newsMonitoringIntervalMinutes: 15 | 30 | 60;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxDailyNotifications: number;
  cooldownHours: number;
}

export const DEFAULT_CLOSED_APP_MONITOR_PREFERENCES: ClosedAppMonitorPreferences = {
  enabled: true,
  materialNewsAlerts: true,
  materialNewsThreshold: 'HIGH_AND_CRITICAL',
  materialNewsAlertsActivatedAt: null,
  closedAppNewsMonitoring: false,
  newsMonitoringIntervalMinutes: 30,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  maxDailyNotifications: 5,
  cooldownHours: 6,
};

export interface ClosedAppMonitorStatusRecord {
  lastRunAt: string;
  lastRefreshedAt: string | null;
  exitCode: ClosedAppMonitorExitCode;
  status: 'SUCCESS' | 'SKIPPED' | 'OFFLINE_OR_PROVIDER_UNAVAILABLE' | 'DEPENDENCY_FAILURE' | 'UNEXPECTED_FAILURE';
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

const MAX_MONITOR_LOG_BYTES = 5 * 1024 * 1024; // 5 MB (PARTE BP)
const HIGH_POST_QUIET_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h (PARTE AS)

export function getAtlasDataDir(): string {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Atlas');
  }
  if (process.env.USERPROFILE) {
    return path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Atlas');
  }
  return path.resolve(process.cwd(), '.atlas-local');
}

export function sanitizeMonitorText(raw: string): string {
  return raw
    .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://[REDACTED]@')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/\b(BRAPI_API_KEY|MARKET_DATA_API_TOKEN|token|password|api_key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

export function appendMonitorLog(line: string, dataDir: string = getAtlasDataDir()): void {
  const logsDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, 'news-monitor.log');

  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_MONITOR_LOG_BYTES) {
      const oldPath = path.join(logsDir, 'news-monitor.log.old');
      if (fs.existsSync(oldPath)) fs.rmSync(oldPath, { force: true });
      fs.renameSync(logPath, oldPath);
    }
    const stamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${stamp}] ${sanitizeMonitorText(line)}\n`, 'utf-8');
  } catch {
    // Non-fatal log write failure
  }
}

export function readClosedAppPreferences(dataDir: string = getAtlasDataDir()): ClosedAppMonitorPreferences {
  const prefsPath = path.join(dataDir, 'news-monitor-prefs.json');
  try {
    if (!fs.existsSync(prefsPath)) {
      return { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES };
    }
    const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')) as Partial<ClosedAppMonitorPreferences>;
    return {
      ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES,
      ...raw,
      closedAppNewsMonitoring: Boolean(raw.closedAppNewsMonitoring),
      newsMonitoringIntervalMinutes:
        raw.newsMonitoringIntervalMinutes === 15 ||
        raw.newsMonitoringIntervalMinutes === 30 ||
        raw.newsMonitoringIntervalMinutes === 60
          ? raw.newsMonitoringIntervalMinutes
          : 30,
    };
  } catch {
    return { ...DEFAULT_CLOSED_APP_MONITOR_PREFERENCES };
  }
}

export function writeClosedAppStatus(
  record: ClosedAppMonitorStatusRecord,
  dataDir: string = getAtlasDataDir(),
): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'news-monitor-status.json'),
      JSON.stringify(record, null, 2),
      'utf-8',
    );
  } catch {
    // Non-fatal status write failure
  }
}

export function isQuietHoursActive(
  prefs: Pick<ClosedAppMonitorPreferences, 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd'>,
  now: Date = new Date(),
): boolean {
  if (!prefs.quietHoursEnabled) return false;

  const [shRaw, smRaw] = (prefs.quietHoursStart || '22:00').split(':');
  const [ehRaw, emRaw] = (prefs.quietHoursEnd || '08:00').split(':');
  const startHour = Number(shRaw ?? 22);
  const startMin = Number(smRaw ?? 0);
  const endHour = Number(ehRaw ?? 8);
  const endMin = Number(emRaw ?? 0);
  if ([startHour, startMin, endHour, endMin].some((n) => Number.isNaN(n))) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function selectDeliverableClosedAppCandidates(params: {
  inbox: PortfolioNewsInboxResult;
  prefs: ClosedAppMonitorPreferences;
  now?: Date;
}): {
  deliverable: NewsAlertCandidate[];
  suppressedQuietHoursCount: number;
} {
  const { inbox, prefs } = params;
  const now = params.now ?? new Date();
  if (!prefs.enabled || !prefs.materialNewsAlerts) {
    return { deliverable: [], suppressedQuietHoursCount: 0 };
  }

  const eligible = inbox.alertsMeta?.eligibleEvents ?? [];
  if (eligible.length === 0) {
    return { deliverable: [], suppressedQuietHoursCount: 0 };
  }

  const eventById = new Map(inbox.events.map((e) => [e.canonicalEventId, e]));
  const activatedAtMs = prefs.materialNewsAlertsActivatedAt
    ? Date.parse(prefs.materialNewsAlertsActivatedAt)
    : Number.NaN;
  const nowMs = now.getTime();

  const matching: NewsAlertCandidate[] = [];
  for (const dto of eligible) {
    if (prefs.materialNewsThreshold === 'CRITICAL_ONLY' && dto.materiality !== 'CRITICAL') {
      continue;
    }
    if (
      prefs.materialNewsThreshold === 'HIGH_AND_CRITICAL' &&
      dto.materiality !== 'CRITICAL' &&
      dto.materiality !== 'HIGH'
    ) {
      continue;
    }

    const event = eventById.get(dto.canonicalEventId);
    if (!event) continue;

    if (Number.isFinite(activatedAtMs) && event.publishedAt) {
      const pubMs = Date.parse(event.publishedAt);
      if (Number.isFinite(pubMs) && pubMs <= activatedAtMs) {
        continue;
      }
    }

    // Post-quiet / stale HIGH policy (PARTE AS): CRITICAL keeps eligibility; HIGH > 6h suppressed
    if (dto.materiality === 'HIGH' && event.publishedAt) {
      const pubMs = Date.parse(event.publishedAt);
      if (Number.isFinite(pubMs) && nowMs - pubMs > HIGH_POST_QUIET_MAX_AGE_MS) {
        continue;
      }
    }

    matching.push({
      portfolioId: dto.portfolioId,
      canonicalEventId: dto.canonicalEventId,
      eventVersionFingerprint: dto.eventVersionFingerprint,
      alertIdentityKey: dto.alertIdentityKey,
      state: dto.state,
      materiality: dto.materiality,
      ticker: dto.ticker,
      headline: dto.headline,
      materialityReason: dto.materialityReason,
      official: dto.official,
      officialSourceLabel: dto.officialSourceLabel,
      publishedAt: dto.publishedAt,
      event,
    });
  }

  if (matching.length === 0) {
    return { deliverable: [], suppressedQuietHoursCount: 0 };
  }

  // Quiet hours policy (PARTE AP/AQ/AR): CRITICAL does NOT bypass quiet hours
  if (isQuietHoursActive(prefs, now)) {
    return {
      deliverable: [],
      suppressedQuietHoursCount: matching.length,
    };
  }

  return {
    deliverable: matching,
    suppressedQuietHoursCount: 0,
  };
}

/**
 * Native Windows 10/11 Toast Notifier for closed-app execution without Tauri WebView (PARTE AT/AV).
 */
export class WindowsBackgroundNewsAlertNotifier implements NewsAlertNotifier {
  constructor(private readonly appId: string = 'br.com.atlasinvest.app') {}

  async notifyMaterialNews(payload: NewsAlertDispatchItem): Promise<NewsAlertDeliveryResult> {
    if (process.platform !== 'win32') {
      return {
        status: 'NOTIFICATIONS_UNSUPPORTED',
        reason: `Unsupported platform for WindowsBackgroundNewsAlertNotifier: ${process.platform}`,
      };
    }

    const notificationId = `atlas-bg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const psScript = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
$t = & $esc $env:ATLAS_TOAST_TITLE
$b = & $esc $env:ATLAS_TOAST_BODY
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template=\`"ToastText02\`"><text id=\`"1\`">$t</text><text id=\`"2\`">$b</text></binding></visual></toast>")
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:ATLAS_TOAST_APP_ID)
$notifier.Show($toast)
`;

    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
        {
          timeout: 15000,
          windowsHide: true,
          env: {
            ...process.env,
            ATLAS_TOAST_TITLE: payload.title,
            ATLAS_TOAST_BODY: payload.body,
            ATLAS_TOAST_APP_ID: this.appId,
          },
        },
      );
      return {
        status: 'DELIVERED',
        notificationId,
      };
    } catch (error) {
      return {
        status: 'DELIVERY_FAILED',
        reason: error instanceof Error ? error.message : 'WinRT toast notification failed',
      };
    }
  }
}

export interface ClosedAppMonitorRuntimeDeps {
  listOwnerPortfolios(userId: string): Promise<Array<{ id: string }>>;
  getPortfolioNews(params: {
    portfolioId: string;
    userId: string;
    forceRefresh?: boolean;
    now?: Date;
  }): Promise<PortfolioNewsInboxResult>;
  claimPendingNewsAlerts(params: {
    portfolioId: string;
    userId: string;
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>;
    now?: Date;
  }): Promise<{ claimed: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> }>;
  confirmNewsAlertsDelivered(params: {
    portfolioId: string;
    userId: string;
    items: NewsAlertDeliveryAuditItem[];
    alertAttemptId?: string;
    notificationId?: string | null;
    now?: Date;
  }): Promise<unknown>;
  releaseNewsAlertsClaim(params: {
    portfolioId: string;
    userId: string;
    items: NewsAlertDeliveryAuditItem[];
    deliveryStatus?: 'PERMISSION_DENIED' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'DELIVERY_FAILED';
    failureReason?: string | null;
    attemptedAt?: string;
    alertAttemptId?: string;
    recordHistory?: boolean;
  }): Promise<unknown>;
  notifier: NewsAlertNotifier;
  prefs: ClosedAppMonitorPreferences;
  dataDir?: string;
  now?: Date;
  startedPostgres?: boolean;
  atlasVersion?: string;
  monitorVersion?: string;
}

export async function runClosedAppNewsMonitorCycle(
  deps: ClosedAppMonitorRuntimeDeps,
): Promise<ClosedAppMonitorStatusRecord> {
  const startedAtMs = Date.now();
  const now = deps.now ?? new Date();
  const dataDir = deps.dataDir ?? getAtlasDataDir();
  const startedPostgres = Boolean(deps.startedPostgres);
  const atlasVersion = deps.atlasVersion ?? process.env.ATLAS_APP_VERSION ?? '0.1.0-pilot.1';
  const monitorVersion = deps.monitorVersion ?? process.env.ATLAS_MONITOR_VERSION ?? '0.1.0-pilot.1';

  const finalize = (record: ClosedAppMonitorStatusRecord): ClosedAppMonitorStatusRecord => {
    appendMonitorLog(
      `origin=CLOSED_APP status=${record.status} exitCode=${record.exitCode} auditedAssets=${record.auditedAssets} events=${record.eventsCount} delivered=${record.deliveredAlertsCount} suppressedQuiet=${record.suppressedQuietHoursCount} startedPostgres=${record.startedPostgres} durationMs=${record.durationMs}`,
      dataDir,
    );
    writeClosedAppStatus(record, dataDir);
    return record;
  };

  if (!deps.prefs.closedAppNewsMonitoring) {
    return finalize({
      lastRunAt: now.toISOString(),
      lastRefreshedAt: null,
      exitCode: CLOSED_APP_MONITOR_EXIT_CODES.SKIPPED,
      status: 'SKIPPED',
      auditedAssets: 0,
      eventsCount: 0,
      deliveredAlertsCount: 0,
      suppressedQuietHoursCount: 0,
      startedPostgres,
      durationMs: Date.now() - startedAtMs,
      atlasVersion,
      monitorVersion,
      providersUsed: [],
      officialStatus: null,
      cvmStatus: null,
      fnetStatus: null,
      error: 'closedAppNewsMonitoring is disabled',
    });
  }

  let portfolios: Array<{ id: string }>;
  try {
    portfolios = await deps.listOwnerPortfolios(LOCAL_OWNER_USER_ID);
  } catch (err) {
    return finalize({
      lastRunAt: now.toISOString(),
      lastRefreshedAt: null,
      exitCode: CLOSED_APP_MONITOR_EXIT_CODES.DEPENDENCY_FAILURE,
      status: 'DEPENDENCY_FAILURE',
      auditedAssets: 0,
      eventsCount: 0,
      deliveredAlertsCount: 0,
      suppressedQuietHoursCount: 0,
      startedPostgres,
      durationMs: Date.now() - startedAtMs,
      atlasVersion,
      monitorVersion,
      providersUsed: [],
      officialStatus: null,
      cvmStatus: null,
      fnetStatus: null,
      error: err instanceof Error ? err.message : 'Failed to list portfolios',
    });
  }

  if (portfolios.length === 0) {
    return finalize({
      lastRunAt: now.toISOString(),
      lastRefreshedAt: null,
      exitCode: CLOSED_APP_MONITOR_EXIT_CODES.SKIPPED,
      status: 'SKIPPED',
      auditedAssets: 0,
      eventsCount: 0,
      deliveredAlertsCount: 0,
      suppressedQuietHoursCount: 0,
      startedPostgres,
      durationMs: Date.now() - startedAtMs,
      atlasVersion,
      monitorVersion,
      providersUsed: [],
      officialStatus: null,
      cvmStatus: null,
      fnetStatus: null,
      error: 'No active local portfolio found',
    });
  }

  let totalAuditedAssets = 0;
  let totalEventsCount = 0;
  let totalDeliveredAlerts = 0;
  let totalSuppressedQuiet = 0;
  let lastRefreshedAt: string | null = null;
  let lastProvidersUsed: string[] = [];
  let lastOfficialStatus: string | null = null;
  let lastCvmStatus: string | null = null;
  let lastFnetStatus: string | null = null;
  let allProvidersOffline = false;

  try {
    for (const portfolio of portfolios) {
      const inbox = await deps.getPortfolioNews({
        portfolioId: portfolio.id,
        userId: LOCAL_OWNER_USER_ID,
        forceRefresh: true,
        now,
      });

      totalAuditedAssets += inbox.metrics.totalAuditedAssets;
      totalEventsCount += inbox.totalEvents;
      lastRefreshedAt = inbox.newsState?.lastRefreshedAt ?? inbox.asOf ?? now.toISOString();
      lastProvidersUsed = inbox.metrics.providerStatus.providersUsed;
      lastOfficialStatus = inbox.metrics.providerStatus.officialStatus ?? null;
      lastCvmStatus = inbox.metrics.providerStatus.cvmStatus ?? null;
      lastFnetStatus = inbox.metrics.providerStatus.fnetStatus ?? null;

      const providersUnavailable =
        inbox.metrics.totalAuditedAssets > 0 &&
        inbox.totalEvents === 0 &&
        inbox.metrics.providerStatus.officialStatus === 'OFFICIAL_PROVIDER_UNAVAILABLE' &&
        !inbox.metrics.providerStatus.brapiNewsAvailable &&
        !inbox.metrics.providerStatus.fallbackActive;

      if (providersUnavailable) {
        allProvidersOffline = true;
        continue;
      }

      const { deliverable, suppressedQuietHoursCount } = selectDeliverableClosedAppCandidates({
        inbox,
        prefs: deps.prefs,
        now,
      });
      totalSuppressedQuiet += suppressedQuietHoursCount;

      if (deliverable.length > 0) {
        const ports: AlertDeliveryCoordinatorPorts = {
          claimPendingAlerts: async ({ portfolioId, candidates }) => {
            const res = await deps.claimPendingNewsAlerts({
              portfolioId,
              userId: LOCAL_OWNER_USER_ID,
              items: candidates,
              now,
            });
            return res.claimed;
          },
          confirmAlertsDelivered: async ({ portfolioId, delivered }) => {
            const first = delivered[0];
            await deps.confirmNewsAlertsDelivered({
              portfolioId,
              userId: LOCAL_OWNER_USER_ID,
              items: delivered,
              alertAttemptId: first?.alertAttemptId,
              notificationId: first?.notificationId ?? null,
              now,
            });
          },
          releaseAlertsClaim: async ({ portfolioId, items }) => {
            const first = items[0];
            const mappedStatus =
              first?.deliveryStatus === 'PERMISSION_DENIED' ||
              first?.deliveryStatus === 'UNSUPPORTED' ||
              first?.deliveryStatus === 'UNAVAILABLE'
                ? first.deliveryStatus
                : 'DELIVERY_FAILED';
            await deps.releaseNewsAlertsClaim({
              portfolioId,
              userId: LOCAL_OWNER_USER_ID,
              items,
              deliveryStatus: mappedStatus,
              failureReason: first?.failureReason ?? null,
              attemptedAt: first?.attemptedAt,
              alertAttemptId: first?.alertAttemptId,
              recordHistory: true,
            });
          },
        };

        const dispatchRes = await deliverMaterialNewsAlerts({
          portfolioId: portfolio.id,
          candidates: deliverable,
          notifier: deps.notifier,
          ports,
        });
        totalDeliveredAlerts += dispatchRes.deliveredCount;
      }
    }
  } catch (err) {
    return finalize({
      lastRunAt: now.toISOString(),
      lastRefreshedAt,
      exitCode: CLOSED_APP_MONITOR_EXIT_CODES.UNEXPECTED_FAILURE,
      status: 'UNEXPECTED_FAILURE',
      auditedAssets: totalAuditedAssets,
      eventsCount: totalEventsCount,
      deliveredAlertsCount: totalDeliveredAlerts,
      suppressedQuietHoursCount: totalSuppressedQuiet,
      startedPostgres,
      durationMs: Date.now() - startedAtMs,
      atlasVersion,
      monitorVersion,
      providersUsed: lastProvidersUsed,
      officialStatus: lastOfficialStatus,
      cvmStatus: lastCvmStatus,
      fnetStatus: lastFnetStatus,
      error: err instanceof Error ? err.message : 'Unexpected news monitor cycle error',
    });
  }

  if (allProvidersOffline && totalEventsCount === 0) {
    return finalize({
      lastRunAt: now.toISOString(),
      lastRefreshedAt,
      exitCode: CLOSED_APP_MONITOR_EXIT_CODES.OFFLINE_OR_PROVIDER_UNAVAILABLE,
      status: 'OFFLINE_OR_PROVIDER_UNAVAILABLE',
      auditedAssets: totalAuditedAssets,
      eventsCount: totalEventsCount,
      deliveredAlertsCount: totalDeliveredAlerts,
      suppressedQuietHoursCount: totalSuppressedQuiet,
      startedPostgres,
      durationMs: Date.now() - startedAtMs,
      atlasVersion,
      monitorVersion,
      providersUsed: lastProvidersUsed,
      officialStatus: lastOfficialStatus,
      cvmStatus: lastCvmStatus,
      fnetStatus: lastFnetStatus,
      error: 'Providers unavailable or offline',
    });
  }

  return finalize({
    lastRunAt: now.toISOString(),
    lastRefreshedAt,
    exitCode: CLOSED_APP_MONITOR_EXIT_CODES.SUCCESS,
    status: 'SUCCESS',
    auditedAssets: totalAuditedAssets,
    eventsCount: totalEventsCount,
    deliveredAlertsCount: totalDeliveredAlerts,
    suppressedQuietHoursCount: totalSuppressedQuiet,
    startedPostgres,
    durationMs: Date.now() - startedAtMs,
    atlasVersion,
    monitorVersion,
    providersUsed: lastProvidersUsed,
    officialStatus: lastOfficialStatus,
    cvmStatus: lastCvmStatus,
    fnetStatus: lastFnetStatus,
    error: null,
  });
}

async function main(): Promise<void> {
  const dataDir = getAtlasDataDir();
  const prefs = readClosedAppPreferences(dataDir);
  const startedPostgres = process.env.ATLAS_STARTED_POSTGRES === 'true';

  if (!prefs.closedAppNewsMonitoring) {
    const rec = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async () => [],
      getPortfolioNews: async () => {
        throw new Error('unreachable');
      },
      claimPendingNewsAlerts: async () => ({ claimed: [] }),
      confirmNewsAlertsDelivered: async () => undefined,
      releaseNewsAlertsClaim: async () => undefined,
      notifier: new WindowsBackgroundNewsAlertNotifier(),
      prefs,
      dataDir,
      startedPostgres,
    });
    process.exit(rec.exitCode);
  }

  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const portfolioRepo = app.get<IPortfolioRepository>(PORTFOLIO_REPOSITORY);
    const radarUseCase = app.get(GetOpportunityRadarUseCase);

    const record = await runClosedAppNewsMonitorCycle({
      listOwnerPortfolios: async (userId) => {
        const list = await portfolioRepo.findByUserId(userId);
        return list.map((p) => ({ id: String(p.id) }));
      },
      getPortfolioNews: (p) => radarUseCase.getPortfolioNews(p),
      claimPendingNewsAlerts: (p) => radarUseCase.claimPendingNewsAlerts(p),
      confirmNewsAlertsDelivered: (p) => radarUseCase.confirmNewsAlertsDelivered(p),
      releaseNewsAlertsClaim: (p) => radarUseCase.releaseNewsAlertsClaim(p),
      notifier: new WindowsBackgroundNewsAlertNotifier(),
      prefs,
      dataDir,
      startedPostgres,
    });

    await app.close();
    process.exit(record.exitCode);
  } catch (err) {
    appendMonitorLog(
      `Closed-app monitor fatal error: ${err instanceof Error ? err.message : String(err)}`,
      dataDir,
    );
    if (app) {
      await app.close().catch(() => undefined);
    }
    process.exit(CLOSED_APP_MONITOR_EXIT_CODES.UNEXPECTED_FAILURE);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  void main();
}
