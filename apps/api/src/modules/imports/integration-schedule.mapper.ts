import type { IntegrationScheduleRow } from '@atlas/database';

export interface IntegrationScheduleResponse {
  id: string;
  portfolioId: string;
  source: string;
  provider: string;
  environment: string;
  cadence: string;
  hourLocal: number | null;
  minuteLocal: number | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phase 5P-A — schedule read model. Intent and cadence only: no payloads,
 * no tokens, no secrets, no provider internals.
 */
export function mapIntegrationScheduleToResponse(
  row: IntegrationScheduleRow,
): IntegrationScheduleResponse {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    source: row.source,
    provider: row.provider,
    environment: row.environment,
    cadence: row.cadence,
    hourLocal: row.hourLocal,
    minuteLocal: row.minuteLocal,
    timezone: row.timezone,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastStatus: row.lastStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
