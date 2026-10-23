import type {
  IntegrationAvailability,
  IntegrationConnectionState,
  IntegrationStatus,
} from '@atlas/import-engine';
import type { IntegrationSettingsService } from '../../application/imports/integration-settings.service';
import {
  mapIntegrationScheduleToResponse,
  type IntegrationScheduleResponse,
} from '../imports/integration-schedule.mapper';

export interface IntegrationSettingsRunSummaryResponse {
  id: string;
  status: string;
  trigger: string | null;
  partial: boolean;
  createdAt: string;
  completedAt: string | null;
  newRecords: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
}

export interface IntegrationSourceSettingsResponse {
  source: string;
  provider: string;
  environment: string;
  availability: IntegrationAvailability;
  connection: { state: IntegrationConnectionState };
  canEnable: boolean;
  canDisable: boolean;
  canEditSchedule: boolean;
  schedule: IntegrationScheduleResponse | null;
  lastRun: IntegrationSettingsRunSummaryResponse | null;
  lastSuccessfulRun: { id: string; at: string } | null;
  pendingReviewCount: number;
  status: IntegrationStatus;
}

export interface IntegrationSettingsResponse {
  portfolioId: string;
  sources: IntegrationSourceSettingsResponse[];
}

type SourceSettings = Awaited<
  ReturnType<IntegrationSettingsService['getSettings']>
>['sources'][number];

function mapRunSummary(
  row: NonNullable<SourceSettings['lastRun']>,
): IntegrationSettingsRunSummaryResponse {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    partial: row.partial,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    newRecords: row.newCandidates,
    exactDuplicates: row.exactDuplicates,
    probableDuplicates: row.probableDuplicates,
    conflicts: row.conflicts,
    unsupported: row.unsupported,
    invalid: row.invalid,
  };
}

/**
 * Phase 5P-C — settings read model. Operational settings state only:
 * capability, connection, schedule intent, derived execution outcome and
 * counts. No payloads, no tokens, no secrets, no provider internals.
 */
export function mapIntegrationSettingsToResponse(
  model: Awaited<ReturnType<IntegrationSettingsService['getSettings']>>,
): IntegrationSettingsResponse {
  return {
    portfolioId: model.portfolioId,
    sources: model.sources.map((source) => ({
      source: source.source,
      provider: source.provider,
      environment: source.environment,
      availability: source.availability,
      connection: { state: source.connection.state },
      canEnable: source.canEnable,
      canDisable: source.canDisable,
      canEditSchedule: source.canEditSchedule,
      schedule: source.schedule ? mapIntegrationScheduleToResponse(source.schedule) : null,
      lastRun: source.lastRun ? mapRunSummary(source.lastRun) : null,
      lastSuccessfulRun: source.lastSuccessfulRun
        ? {
            id: source.lastSuccessfulRun.id,
            at: (
              source.lastSuccessfulRun.completedAt ?? source.lastSuccessfulRun.createdAt
            ).toISOString(),
          }
        : null,
      pendingReviewCount: source.pendingReviewCount,
      status: source.status,
    })),
  };
}
