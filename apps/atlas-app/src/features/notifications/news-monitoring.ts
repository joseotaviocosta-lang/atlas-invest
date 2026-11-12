import type {
  NewsMonitoringIntervalMinutes,
  NewsRefreshSource,
  NotificationPreferences,
  PortfolioNewsMonitoringDiagnostics,
  PortfolioNewsMonitoringStatus,
} from './types';
import { isInQuietHours } from './engine';
import {
  DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES,
  normalizeNewsMonitoringIntervalMinutes,
} from './preferences';

export {
  ALLOWED_NEWS_MONITORING_INTERVALS,
  DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES,
  normalizeNewsMonitoringIntervalMinutes,
} from './preferences';

export const DEFERRED_HIGH_ALERT_MAX_AGE_HOURS = 6;
export const OFFLINE_BACKOFF_SCHEDULE_MINUTES = [30, 60, 120] as const;

const MONITORING_STORAGE_PREFIX = 'atlas.news.monitoring.';

export interface MonitoringTimerAdapter {
  now: () => number;
  setTimeout: (fn: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const DEFAULT_TIMER_ADAPTER: MonitoringTimerAdapter = {
  now: () => Date.now(),
  setTimeout: (fn, delayMs) => globalThis.setTimeout(fn, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PersistedPortfolioMonitoringState {
  portfolioId: string;
  lastAttemptMs: number | null;
  lastSuccessMs: number | null;
  lastSuccessfulAutomaticRefreshMs: number | null;
  lastAutomaticRefreshAttemptMs: number | null;
  nextScheduledMs: number | null;
  lastTrigger: NewsRefreshSource | null;
  consecutiveFailures: number;
  backoffUntilMs: number | null;
  lastCycleDurationMs: number | null;
  lastError: string | null;
  overlapSkips: number;
  automaticCyclesCompleted: number;
  networkFailures: number;
}

const memoryMonitoringStore = new Map<string, PersistedPortfolioMonitoringState>();

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function buildStorageKey(userId: string, portfolioId: string): string {
  return `${MONITORING_STORAGE_PREFIX}${userId.trim() || 'default'}.${portfolioId}`;
}

function createEmptyMonitoringState(portfolioId: string): PersistedPortfolioMonitoringState {
  return {
    portfolioId,
    lastAttemptMs: null,
    lastSuccessMs: null,
    lastSuccessfulAutomaticRefreshMs: null,
    lastAutomaticRefreshAttemptMs: null,
    nextScheduledMs: null,
    lastTrigger: null,
    consecutiveFailures: 0,
    backoffUntilMs: null,
    lastCycleDurationMs: null,
    lastError: null,
    overlapSkips: 0,
    automaticCyclesCompleted: 0,
    networkFailures: 0,
  };
}

export function loadPortfolioMonitoringState(
  userId: string | null | undefined,
  portfolioId: string,
): PersistedPortfolioMonitoringState {
  const uid = userId?.trim() || 'default';
  const key = buildStorageKey(uid, portfolioId);

  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedPortfolioMonitoringState>;
        return {
          ...createEmptyMonitoringState(portfolioId),
          ...parsed,
          portfolioId,
        };
      }
    } catch {
      // Fallback to in-memory store
    }
  }

  const inMem = memoryMonitoringStore.get(key);
  if (inMem) {
    return { ...inMem };
  }

  return createEmptyMonitoringState(portfolioId);
}

export function savePortfolioMonitoringState(
  userId: string | null | undefined,
  state: PersistedPortfolioMonitoringState,
): void {
  const uid = userId?.trim() || 'default';
  const key = buildStorageKey(uid, state.portfolioId);
  const copy = { ...state };
  memoryMonitoringStore.set(key, copy);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(copy));
    } catch {
      // Ignore quota errors cleanly
    }
  }
}

export function clearPortfolioNewsMonitoringState(userId?: string | null): void {
  const uid = userId?.trim() || 'default';
  const prefix = `${MONITORING_STORAGE_PREFIX}${uid}.`;

  for (const key of Array.from(memoryMonitoringStore.keys())) {
    if (key.startsWith(prefix)) {
      memoryMonitoringStore.delete(key);
    }
  }

  const storage = getStorage();
  if (storage) {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(prefix)) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        storage.removeItem(k);
      }
    } catch {
      // Ignore storage access errors
    }
  }
}

/**
 * Computes conservative exponential backoff for failed automatic news fetches:
 * failure #1 -> 30 min, #2 -> 60 min, #3+ -> 120 min (cap).
 */
export function computeOfflineBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES * 60 * 1000;
  }
  const index = Math.min(consecutiveFailures - 1, OFFLINE_BACKOFF_SCHEDULE_MINUTES.length - 1);
  return OFFLINE_BACKOFF_SCHEDULE_MINUTES[index]! * 60 * 1000;
}

export function derivePortfolioNewsMonitoringStatus(params: {
  isAuthenticated: boolean;
  portfolioId: string | null;
  preferences: NotificationPreferences;
  isOnline: boolean;
  nowMs: number;
  consecutiveFailures?: number;
  backoffUntilMs?: number | null;
}): PortfolioNewsMonitoringStatus {
  if (!params.isAuthenticated || !params.portfolioId) {
    return 'PAUSED_NO_PORTFOLIO';
  }
  if (!params.preferences.automaticNewsMonitoring) {
    return 'DISABLED';
  }
  if (
    !params.isOnline ||
    ((params.consecutiveFailures ?? 0) > 0 &&
      params.backoffUntilMs !== null &&
      params.backoffUntilMs !== undefined &&
      params.backoffUntilMs > params.nowMs)
  ) {
    return 'PAUSED_OFFLINE';
  }
  if (isInQuietHours(params.preferences, new Date(params.nowMs))) {
    return 'PAUSED_QUIET_HOURS';
  }
  return 'ENABLED';
}

function sanitizeMonitoringError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Network or upstream news refresh error';
  const line = (raw.split(/\r?\n/)[0] ?? '')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(bearer|token|secret|password|apikey|api_key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[MASKED_JWT]')
    .replace(/R\$\s*[\d.,]+/gi, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  return line ? line.slice(0, 180) : 'News refresh error';
}

function toIsoOrNull(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export interface MonitoringContextInput {
  isAuthenticated: boolean;
  userId: string | null;
  portfolioId: string | null;
  preferences: NotificationPreferences;
  isOnline: boolean;
}

export interface PortfolioNewsMonitoringCoordinatorOptions {
  timer?: Partial<MonitoringTimerAdapter>;
  persistState?: boolean;
  onRefreshPortfolioNews: (portfolioId: string, source: NewsRefreshSource) => Promise<void>;
  onQuietHoursEnded?: (portfolioId: string) => void;
  onDiagnosticsChange?: (diagnostics: PortfolioNewsMonitoringDiagnostics) => void;
}

/**
 * Single owner coordinator for automatic in-app portfolio news monitoring (APP-16P).
 * Guarantees at most one active scheduled timer and zero overlapping refresh cycles per portfolio.
 * Runs exclusively inside the active Atlas process (OPEN or MINIMIZED); stops cleanly on logout/close.
 */
export class PortfolioNewsMonitoringCoordinator {
  private readonly timer: MonitoringTimerAdapter;
  private readonly persistState: boolean;
  private readonly onRefreshPortfolioNews: (portfolioId: string, source: NewsRefreshSource) => Promise<void>;
  private readonly onQuietHoursEnded?: (portfolioId: string) => void;
  private readonly onDiagnosticsChange?: (diagnostics: PortfolioNewsMonitoringDiagnostics) => void;

  private timerHandle: unknown | null = null;
  private context: MonitoringContextInput | null = null;
  private state: PersistedPortfolioMonitoringState | null = null;
  private sessionAnchorMs: number | null = null;
  private inFlight = false;
  private inFlightPromise: Promise<boolean> | null = null;
  private isTerminating = false;
  private wasOffline = false;
  private wasInQuietHours = false;
  private prevIntervalMinutes: NewsMonitoringIntervalMinutes | null = null;

  constructor(options: PortfolioNewsMonitoringCoordinatorOptions) {
    this.timer = {
      now: options.timer?.now ?? DEFAULT_TIMER_ADAPTER.now,
      setTimeout: options.timer?.setTimeout ?? DEFAULT_TIMER_ADAPTER.setTimeout,
      clearTimeout: options.timer?.clearTimeout ?? DEFAULT_TIMER_ADAPTER.clearTimeout,
    };
    this.persistState = options.persistState ?? true;
    this.onRefreshPortfolioNews = options.onRefreshPortfolioNews;
    this.onQuietHoursEnded = options.onQuietHoursEnded;
    this.onDiagnosticsChange = options.onDiagnosticsChange;
  }

  public getActiveTimerCount(): number {
    return this.timerHandle !== null ? 1 : 0;
  }

  public getDiagnostics(): PortfolioNewsMonitoringDiagnostics {
    const nowMs = this.timer.now();
    const ctx = this.context;
    const st = this.state;
    const intervalMinutes = ctx
      ? normalizeNewsMonitoringIntervalMinutes(ctx.preferences.newsMonitoringIntervalMinutes)
      : DEFAULT_NEWS_MONITORING_INTERVAL_MINUTES;

    const status = ctx
      ? derivePortfolioNewsMonitoringStatus({
          isAuthenticated: ctx.isAuthenticated,
          portfolioId: ctx.portfolioId,
          preferences: ctx.preferences,
          isOnline: ctx.isOnline,
          nowMs,
          consecutiveFailures: st?.consecutiveFailures,
          backoffUntilMs: st?.backoffUntilMs,
        })
      : 'PAUSED_NO_PORTFOLIO';

    const quietActive = ctx ? isInQuietHours(ctx.preferences, new Date(nowMs)) : false;

    return {
      status,
      monitoringEnabled: Boolean(ctx?.isAuthenticated && ctx?.portfolioId && ctx?.preferences.automaticNewsMonitoring),
      intervalMinutes,
      portfolioId: ctx?.portfolioId ?? null,
      lastAttemptAt: toIsoOrNull(st?.lastAttemptMs ?? null),
      lastSuccessAt: toIsoOrNull(st?.lastSuccessMs ?? null),
      lastSuccessfulAutomaticRefreshAt: toIsoOrNull(st?.lastSuccessfulAutomaticRefreshMs ?? null),
      lastAutomaticRefreshAttemptAt: toIsoOrNull(st?.lastAutomaticRefreshAttemptMs ?? null),
      nextScheduledAt: toIsoOrNull(st?.nextScheduledMs ?? null),
      inFlight: this.inFlight,
      quietHours: {
        enabled: ctx?.preferences.quietHoursEnabled ?? true,
        active: quietActive,
        start: ctx?.preferences.quietHoursStart ?? '22:00',
        end: ctx?.preferences.quietHoursEnd ?? '08:00',
        policy: 'REFRESH_CONTINUES_ALERTS_SUPPRESSED',
        criticalBypassesQuietHours: false,
        highDeferralWindowHours: DEFERRED_HIGH_ALERT_MAX_AGE_HOURS,
      },
      lastTrigger: st?.lastTrigger ?? null,
      consecutiveFailures: st?.consecutiveFailures ?? 0,
      backoffUntilAt: toIsoOrNull(st?.backoffUntilMs ?? null),
      lastCycleDurationMs: st?.lastCycleDurationMs ?? null,
      lastError: st?.lastError ?? null,
      overlapSkips: st?.overlapSkips ?? 0,
      automaticCyclesCompleted: st?.automaticCyclesCompleted ?? 0,
      networkFailures: st?.networkFailures ?? 0,
    };
  }

  private emitDiagnostics(): void {
    this.onDiagnosticsChange?.(this.getDiagnostics());
  }

  private saveState(): void {
    if (!this.persistState || !this.context?.userId || !this.state) return;
    savePortfolioMonitoringState(this.context.userId, this.state);
  }

  private loadState(userId: string, portfolioId: string): PersistedPortfolioMonitoringState {
    if (!this.persistState) {
      return createEmptyMonitoringState(portfolioId);
    }
    return loadPortfolioMonitoringState(userId, portfolioId);
  }

  private clearScheduledTimer(): void {
    if (this.timerHandle !== null) {
      this.timer.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private scheduleAt(targetMs: number): void {
    this.clearScheduledTimer();
    if (this.isTerminating || !this.context || !this.state) return;
    if (
      !this.context.isAuthenticated ||
      !this.context.userId ||
      !this.context.portfolioId ||
      !this.context.preferences.automaticNewsMonitoring ||
      !this.context.isOnline
    ) {
      this.state.nextScheduledMs = null;
      return;
    }

    const nowMs = this.timer.now();
    const clampedTarget = Math.max(nowMs, targetMs);
    this.state.nextScheduledMs = clampedTarget;
    const delayMs = Math.max(0, clampedTarget - nowMs);
    const scheduledPortfolioId = this.context.portfolioId;

    this.timerHandle = this.timer.setTimeout(() => {
      this.timerHandle = null;
      if (
        this.isTerminating ||
        !this.context ||
        this.context.portfolioId !== scheduledPortfolioId ||
        !this.context.isAuthenticated ||
        !this.context.preferences.automaticNewsMonitoring ||
        !this.context.isOnline
      ) {
        return;
      }
      void this.refreshNow('AUTOMATIC_INTERVAL');
    }, delayMs);
  }

  private rescheduleAfterContextOrIntervalChange(): void {
    if (this.isTerminating || !this.context || !this.state) return;
    const ctx = this.context;
    const nowMs = this.timer.now();
    const intervalMinutes = normalizeNewsMonitoringIntervalMinutes(ctx.preferences.newsMonitoringIntervalMinutes);
    const intervalMs = intervalMinutes * 60 * 1000;

    if (!ctx.isAuthenticated || !ctx.userId || !ctx.portfolioId || !ctx.preferences.automaticNewsMonitoring || !ctx.isOnline) {
      this.clearScheduledTimer();
      this.state.nextScheduledMs = null;
      this.emitDiagnostics();
      return;
    }

    if (this.state.consecutiveFailures > 0 && this.state.backoffUntilMs !== null) {
      this.scheduleAt(Math.max(nowMs, this.state.backoffUntilMs));
      this.emitDiagnostics();
      return;
    }

    const anchorForFreshCycle =
      this.state.lastSuccessMs !== null && nowMs - this.state.lastSuccessMs < intervalMs
        ? this.state.lastSuccessMs
        : Math.max(this.sessionAnchorMs ?? nowMs, nowMs);
    const existingTarget = this.state.nextScheduledMs;
    const intervalDidChange = this.prevIntervalMinutes !== intervalMinutes;

    // Preserve active valid deadline unless this is a fresh activation, interval changed, or target missing
    const shouldRecompute =
      existingTarget === null ||
      this.timerHandle === null ||
      intervalDidChange;

    const targetMs = shouldRecompute
      ? intervalDidChange && this.state.lastSuccessMs !== null
        ? Math.max(nowMs, this.state.lastSuccessMs + intervalMs)
        : Math.max(nowMs, anchorForFreshCycle + intervalMs)
      : existingTarget;

    this.prevIntervalMinutes = intervalMinutes;
    this.scheduleAt(targetMs);
    this.emitDiagnostics();
  }

  public updateContext(nextContext: MonitoringContextInput): void {
    if (this.isTerminating) return;

    const prevCtx = this.context;
    const normalizedInterval = normalizeNewsMonitoringIntervalMinutes(
      nextContext.preferences.newsMonitoringIntervalMinutes,
    );
    const normalizedPrefs: NotificationPreferences = {
      ...nextContext.preferences,
      automaticNewsMonitoring:
        typeof nextContext.preferences.automaticNewsMonitoring === 'boolean'
          ? nextContext.preferences.automaticNewsMonitoring
          : true,
      newsMonitoringIntervalMinutes: normalizedInterval,
    };

    const effectiveNext: MonitoringContextInput = {
      ...nextContext,
      preferences: normalizedPrefs,
    };

    const userChanged = prevCtx?.userId !== effectiveNext.userId || prevCtx?.isAuthenticated !== effectiveNext.isAuthenticated;
    const portfolioChanged = prevCtx?.portfolioId !== effectiveNext.portfolioId;
    const intervalChanged = this.prevIntervalMinutes !== normalizedInterval;
    const enabledChanged = prevCtx?.preferences.automaticNewsMonitoring !== normalizedPrefs.automaticNewsMonitoring;
    const onlineRecovered = !this.wasOffline ? false : !prevCtx?.isOnline && effectiveNext.isOnline;

    this.wasOffline = !effectiveNext.isOnline;
    const nowMs = this.timer.now();
    const currentlyQuiet = isInQuietHours(normalizedPrefs, new Date(nowMs));
    const quietJustEnded = this.wasInQuietHours && !currentlyQuiet;
    this.wasInQuietHours = currentlyQuiet;

    this.context = effectiveNext;

    if (!effectiveNext.isAuthenticated || !effectiveNext.userId || !effectiveNext.portfolioId) {
      this.clearScheduledTimer();
      this.state = null;
      this.sessionAnchorMs = null;
      this.prevIntervalMinutes = normalizedInterval;
      this.emitDiagnostics();
      return;
    }

    if (userChanged || portfolioChanged || !this.state) {
      this.clearScheduledTimer();
      this.state = this.loadState(effectiveNext.userId, effectiveNext.portfolioId);
      // Clear persisted deadline across cold switches so start honors full interval first
      this.state.nextScheduledMs = null;
      this.sessionAnchorMs = nowMs;
      this.prevIntervalMinutes = normalizedInterval;
    }

    if (!effectiveNext.preferences.automaticNewsMonitoring) {
      this.clearScheduledTimer();
      this.state.nextScheduledMs = null;
      this.prevIntervalMinutes = normalizedInterval;
      this.emitDiagnostics();
      return;
    }

    if (!effectiveNext.isOnline) {
      this.clearScheduledTimer();
      this.state.nextScheduledMs = null;
      this.emitDiagnostics();
      return;
    }

    if (onlineRecovered) {
      const intervalMs = normalizedInterval * 60 * 1000;
      const lastSuccess = this.state.lastSuccessMs;
      const isStale = lastSuccess === null || nowMs - lastSuccess >= intervalMs;
      if ((this.state.consecutiveFailures > 0 || isStale) && !this.inFlight) {
        this.state.backoffUntilMs = null;
        this.emitDiagnostics();
        void this.refreshNow('RECOVERY');
        return;
      }
    }

    if (userChanged || portfolioChanged || intervalChanged || enabledChanged || this.timerHandle === null) {
      this.rescheduleAfterContextOrIntervalChange();
    } else {
      this.emitDiagnostics();
    }

    if (quietJustEnded && effectiveNext.portfolioId) {
      this.onQuietHoursEnded?.(effectiveNext.portfolioId);
    }
  }

  public handleForegroundResume(): boolean {
    if (this.isTerminating || !this.context || !this.state) return false;
    const ctx = this.context;
    if (!ctx.isAuthenticated || !ctx.userId || !ctx.portfolioId) return false;
    if (!ctx.preferences.automaticNewsMonitoring || !ctx.isOnline) return false;

    const nowMs = this.timer.now();
    const currentlyQuiet = isInQuietHours(ctx.preferences, new Date(nowMs));
    const quietJustEnded = this.wasInQuietHours && !currentlyQuiet;
    this.wasInQuietHours = currentlyQuiet;

    if (this.inFlight) {
      this.state.overlapSkips += 1;
      this.emitDiagnostics();
      return false;
    }

    if (
      this.state.consecutiveFailures > 0 &&
      this.state.backoffUntilMs !== null &&
      this.state.backoffUntilMs > nowMs
    ) {
      if (quietJustEnded) {
        this.onQuietHoursEnded?.(ctx.portfolioId);
      }
      return false;
    }

    const intervalMs =
      normalizeNewsMonitoringIntervalMinutes(ctx.preferences.newsMonitoringIntervalMinutes) * 60 * 1000;
    const referenceMs = this.state.lastSuccessMs ?? this.sessionAnchorMs;
    if (referenceMs !== null && nowMs - referenceMs >= intervalMs) {
      void this.refreshNow('FOREGROUND_RESUME');
      return true;
    }

    if (quietJustEnded) {
      this.onQuietHoursEnded?.(ctx.portfolioId);
    }
    return false;
  }

  public async refreshNow(source: NewsRefreshSource = 'MANUAL'): Promise<boolean> {
    if (this.isTerminating || !this.context || !this.context.isAuthenticated || !this.context.portfolioId) {
      return false;
    }

    if (this.inFlight) {
      if (this.state) {
        this.state.overlapSkips += 1;
        this.emitDiagnostics();
      }
      if (source === 'MANUAL' && this.inFlightPromise) {
        return this.inFlightPromise;
      }
      return false;
    }

    const targetPortfolioId = this.context.portfolioId;
    const targetUserId = this.context.userId;
    if (!this.state || this.state.portfolioId !== targetPortfolioId) {
      this.state = targetUserId
        ? this.loadState(targetUserId, targetPortfolioId)
        : createEmptyMonitoringState(targetPortfolioId);
    }

    const startedMs = this.timer.now();
    this.state.lastAttemptMs = startedMs;
    this.state.lastTrigger = source;
    if (source === 'AUTOMATIC_INTERVAL') {
      this.state.lastAutomaticRefreshAttemptMs = startedMs;
    }

    const wasQuietAtAttempt = isInQuietHours(this.context.preferences, new Date(startedMs));
    const quietJustEnded = this.wasInQuietHours && !wasQuietAtAttempt;
    this.wasInQuietHours = wasQuietAtAttempt;

    this.clearScheduledTimer();
    this.inFlight = true;
    this.emitDiagnostics();

    const run = (async (): Promise<boolean> => {
      try {
        await this.onRefreshPortfolioNews(targetPortfolioId, source);
        const finishedMs = this.timer.now();
        const durationMs = Math.max(0, finishedMs - startedMs);

        if (
          this.isTerminating ||
          !this.context ||
          this.context.portfolioId !== targetPortfolioId ||
          !this.state
        ) {
          return true;
        }

        this.state.lastSuccessMs = finishedMs;
        if (source === 'AUTOMATIC_INTERVAL') {
          this.state.lastSuccessfulAutomaticRefreshMs = finishedMs;
          this.state.automaticCyclesCompleted += 1;
        }
        this.state.consecutiveFailures = 0;
        this.state.backoffUntilMs = null;
        this.state.lastCycleDurationMs = durationMs;
        this.state.lastError = null;
        this.sessionAnchorMs = finishedMs;

        const intervalMs =
          normalizeNewsMonitoringIntervalMinutes(this.context.preferences.newsMonitoringIntervalMinutes) *
          60 *
          1000;

        if (this.context.preferences.automaticNewsMonitoring && this.context.isOnline && this.context.isAuthenticated) {
          this.scheduleAt(finishedMs + intervalMs);
        } else {
          this.state.nextScheduledMs = null;
        }

        this.saveState();
        this.emitDiagnostics();

        if (quietJustEnded) {
          this.onQuietHoursEnded?.(targetPortfolioId);
        }
        return true;
      } catch (err) {
        const failedMs = this.timer.now();
        const durationMs = Math.max(0, failedMs - startedMs);

        if (
          this.isTerminating ||
          !this.context ||
          this.context.portfolioId !== targetPortfolioId ||
          !this.state
        ) {
          return false;
        }

        this.state.consecutiveFailures += 1;
        this.state.networkFailures += 1;
        this.state.lastCycleDurationMs = durationMs;
        this.state.lastError = sanitizeMonitoringError(err);

        const backoffMs = computeOfflineBackoffMs(this.state.consecutiveFailures);
        this.state.backoffUntilMs = failedMs + backoffMs;

        if (this.context.preferences.automaticNewsMonitoring && this.context.isOnline && this.context.isAuthenticated) {
          this.scheduleAt(this.state.backoffUntilMs);
        } else {
          this.state.nextScheduledMs = null;
        }

        this.saveState();
        this.emitDiagnostics();
        return false;
      } finally {
        this.inFlight = false;
        this.inFlightPromise = null;
        this.emitDiagnostics();
      }
    })();

    this.inFlightPromise = run;
    return run;
  }

  public dispose(): void {
    this.isTerminating = true;
    this.clearScheduledTimer();
    if (this.state) {
      this.state.nextScheduledMs = null;
    }
    this.emitDiagnostics();
  }
}
