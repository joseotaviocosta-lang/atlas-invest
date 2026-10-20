/**
 * Phase 5H - Operator console API layer (web).
 *
 * Read-only operations client over the frozen Phase 5G/5E/5F admin APIs.
 * This module performs zero financial math: every value is rendered from
 * backend-provided strings. Only explicit operator mutations (manual run,
 * backfill run) may trigger provider calls server-side; all reads are
 * persisted-only (zero-live-read).
 */
import { apiClient } from './client';

export const OPERATIONS_BASE = '/api/v1/admin/operations';
export const INGESTION_JOBS_BASE = '/api/v1/admin/ingestion/jobs';
export const BACKFILL_BASE = '/api/v1/admin/ingestion/backfill';

export type OperationalState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'STALE'
  | 'FAILED'
  | 'UNKNOWN'
  | 'DISABLED';

export interface OperationalFreshnessDto {
  source: string;
  state: OperationalState;
  expectedThrough: string | null;
  actualThrough: string | null;
  lagPeriods: number | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastJobStatus: string | null;
  reasonCode: string;
}

export interface OperationsIssueDto {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  code: string;
  source: string;
  detail: string;
}

export interface OperationsDataStatusDto {
  overall: OperationalState;
  scheduler: { enabled: boolean; running: boolean };
  sources: OperationalFreshnessDto[];
  issues: OperationsIssueDto[];
  latestRuns: Array<Record<string, unknown>>;
  missedSchedules: Array<{ jobType: string; expectedDate: string; scheduledHour: number }>;
  activeAlerts: OperationalAlertDto[];
  generatedAt: string;
}

export interface OperationalAlertDto {
  id: string;
  dedupeKey: string;
  alertType: string;
  severity: string;
  source: string;
  status: 'ACTIVE' | 'RESOLVED';
  reasonCode: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
  metadata: Record<string, string | number | boolean | null> | null;
}

export interface JobsHealthDto {
  recentFailures: Array<Record<string, unknown>>;
  staleRunning: Array<Record<string, unknown>>;
  retryExhausted: Array<Record<string, unknown>>;
  missedSchedules: Array<{ jobType: string; expectedDate: string; scheduledHour: number }>;
  partialRuns: Array<Record<string, unknown>>;
}

export interface OperationsMetricsDto {
  windowDays: number;
  runsTotal: number;
  byStatus: Record<string, number>;
  byTrigger: Record<string, number>;
  providerFailuresTotal: number;
  retryAttemptsTotal: number;
  backfillRunsTotal: number;
  jobsSkippedTotal: number;
  jobsLockedTotal: number;
  avgDurationMs: number | null;
  dataLagPeriods: Record<string, number | null>;
}

export interface ReadinessCheckDto {
  name: string;
  pass: boolean;
  reasonCode: string;
  detail?: string;
}

export interface SchedulerReadinessDto {
  ready: boolean;
  checks: ReadinessCheckDto[];
}

export interface JobRunDto {
  jobRunId: string;
  logicalJobKey: string;
  jobType: string;
  triggerType: string;
  targetPeriod: string;
  targetPeriodGranularity: string;
  scheduledFor: string;
  attempt: number;
  status: string;
  startedAt: string;
  finishedAt: string;
  errorCode?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

export const INGESTION_JOB_TYPES = [
  'MARKET_QUOTES_DAILY',
  'BENCHMARK_IBOV_DAILY',
  'BENCHMARK_CDI_DAILY',
  'FX_USD_BRL_DAILY',
  'FX_EUR_BRL_DAILY',
  'MACRO_IPCA',
  'MACRO_SELIC_TARGET',
  'MACRO_SELIC_EFFECTIVE',
  'CALENDAR_B3_REFRESH',
  'CALENDAR_BANKING_REFRESH',
] as const;

export const BACKFILL_DOMAINS = [
  'MARKET_QUOTES',
  'BENCHMARK_IBOV',
  'BENCHMARK_CDI',
  'FX_USD_BRL',
  'FX_EUR_BRL',
  'MACRO_IPCA',
  'MACRO_SELIC_TARGET',
  'MACRO_SELIC_EFFECTIVE',
  'CALENDAR_B3',
  'CALENDAR_BANKING',
] as const;

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCivilDate(value: string): boolean {
  if (!CIVIL_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y! < 1900 || y! > 2100 || m! < 1 || m! > 12 || d! < 1 || d! > 31) return false;
  return d! <= new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Display-only target-period label. Never normalizes month/year into fake dates. */
export function formatTargetPeriod(period: string, granularity?: string): string {
  if (granularity === 'MONTH' && /^\d{4}-\d{2}$/.test(period)) return period;
  if (granularity === 'YEAR' && /^\d{4}$/.test(period)) return period;
  return period;
}

export const REASON_CODE_COPY: Record<string, string> = {
  UP_TO_DATE: 'Dados atualizados',
  NO_RUN_HISTORY: 'Sem execuções registradas',
  LAST_RUN_FAILED: 'Última execução falhou',
  LATEST_DATA_MISSING: 'Dados esperados ainda não foram persistidos',
  CALENDAR_COVERAGE_MISSING: 'Cobertura de calendário ausente',
  NOT_PUBLISHED_YET: 'Ainda não publicado (aguardando calendário oficial)',
  SCHEDULER_DISABLED: 'Agendador desabilitado por configuração',
  MISSED_SCHEDULE: 'Execução programada não encontrada',
  PROVIDER_FAILURE: 'Falha no provedor',
  PARTIAL_RUN: 'Execução parcial',
  STALE_RUNNING_JOB: 'Execução presa (stale)',
  UNKNOWN: 'Estado desconhecido',
};

export function reasonCodeCopy(code: string): string {
  return REASON_CODE_COPY[code] ?? code;
}

export const operationsQueryKeys = {
  status: ['operations', 'data-status'] as const,
  health: ['operations', 'jobs-health'] as const,
  alerts: (status?: string, limit = 50) => ['operations', 'alerts', status ?? 'all', limit] as const,
  metrics: ['operations', 'metrics'] as const,
  readiness: ['operations', 'scheduler-readiness'] as const,
  jobs: (params: Record<string, string | number | undefined>) =>
    ['ingestion', 'jobs', params] as const,
};

export async function fetchOperationsStatus(): Promise<OperationsDataStatusDto> {
  const res = await apiClient.get<{ data: OperationsDataStatusDto }>(
    `${OPERATIONS_BASE}/data-status`,
  );
  return res.data;
}

export async function fetchJobsHealth(): Promise<JobsHealthDto> {
  const res = await apiClient.get<{ data: JobsHealthDto }>(`${OPERATIONS_BASE}/jobs/health`);
  return res.data;
}

export async function fetchAlerts(
  status?: 'ACTIVE' | 'RESOLVED',
  limit = 50,
): Promise<OperationalAlertDto[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  const res = await apiClient.get<{ data: OperationalAlertDto[] }>(
    `${OPERATIONS_BASE}/alerts?${params.toString()}`,
  );
  return res.data;
}

export async function fetchAlertById(id: string): Promise<OperationalAlertDto> {
  const res = await apiClient.get<{ data: OperationalAlertDto }>(`${OPERATIONS_BASE}/alerts/${id}`);
  return res.data;
}

export async function fetchOperationsMetrics(): Promise<OperationsMetricsDto> {
  const res = await apiClient.get<{ data: OperationsMetricsDto }>(`${OPERATIONS_BASE}/metrics`);
  return res.data;
}

export async function fetchSchedulerReadiness(): Promise<SchedulerReadinessDto> {
  const res = await apiClient.get<{ data: SchedulerReadinessDto }>(
    `${OPERATIONS_BASE}/scheduler/readiness`,
  );
  return res.data;
}

export interface JobHistoryParams {
  jobType?: string;
  status?: string;
  triggerType?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export async function fetchJobHistory(params: JobHistoryParams): Promise<{
  data: JobRunDto[];
  meta: Record<string, unknown>;
}> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiClient.get<{ data: JobRunDto[]; meta: Record<string, unknown> }>(
    `${INGESTION_JOBS_BASE}${suffix}`,
  );
}

export async function fetchJobById(id: string): Promise<JobRunDto> {
  const res = await apiClient.get<{ data: JobRunDto }>(`${INGESTION_JOBS_BASE}/${id}`);
  return res.data;
}

export async function runManualJob(
  jobType: string,
  scheduledFor?: string,
): Promise<Record<string, unknown>> {
  const res = await apiClient.post<{ data: Record<string, unknown> }>(
    `${INGESTION_JOBS_BASE}/${jobType}/run`,
    scheduledFor ? { scheduledFor } : {},
  );
  return res.data;
}

export interface BackfillPlanDto {
  eligibleWindows?: unknown[];
  eligiblePeriods?: unknown[] | number;
  skippedPeriods?: unknown[] | number;
  estimatedProviderCalls?: number;
  requiresConfirmation?: boolean;
  [key: string]: unknown;
}

export async function planBackfill(
  domain: string,
  from: string,
  to: string,
): Promise<BackfillPlanDto> {
  const res = await apiClient.post<{ data: BackfillPlanDto }>(`${BACKFILL_BASE}/plan`, {
    domain,
    from,
    to,
  });
  return res.data;
}

export async function executeBackfill(
  domain: string,
  from: string,
  to: string,
  confirmLargeBackfill = false,
): Promise<Record<string, unknown>> {
  const res = await apiClient.post<{ data: Record<string, unknown> }>(`${BACKFILL_BASE}/run`, {
    domain,
    from,
    to,
    confirmLargeBackfill,
  });
  return res.data;
}
