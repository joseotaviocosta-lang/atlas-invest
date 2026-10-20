/**
 * Phase 5G (I3) - Operational alert event repository (raw SQL, no Prisma
 * typed client regeneration needed) + detection writer.
 *
 * Dedupe is code-enforced via the existing PostgreSQL advisory-lock port:
 * at most one ACTIVE row per dedupe_key. Re-detection while ACTIVE bumps
 * last_detected_at/occurrence_count (no spam). Resolution flips ACTIVE to
 * RESOLVED (history preserved, never deleted). A later recurrence inserts a
 * fresh ACTIVE row.
 */

import { Inject, Injectable } from '@nestjs/common';
import { getPrismaClient } from '@atlas/database';
import { IJobLock, JobLockHandle } from '../job-lock';
import { INGESTION_JOB_LOCK } from '../tokens';
import { AlertSeverity, AlertStatus, AlertType, buildAlertDedupeKey } from './operational-state';

type PrismaLikeClient = ReturnType<typeof getPrismaClient>;

export interface OperationalAlertRow {
  id: string;
  dedupeKey: string;
  alertType: string;
  severity: string;
  source: string;
  status: string;
  reasonCode: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
  metadata: Record<string, string | number | boolean | null> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DetectedCondition {
  readonly alertType: AlertType;
  readonly severity: AlertSeverity;
  readonly source: string;
  readonly reasonCode: string;
  readonly metadata?: Record<string, string | number | boolean | null>;
}

function lockKeyFor(dedupeKey: string): string {
  return `operational-alert:${dedupeKey}`;
}

@Injectable()
export class OperationalAlertRepository {
  constructor(private readonly prisma: PrismaLikeClient) {}

  async findActive(): Promise<OperationalAlertRow[]> {
    return this.prisma.$queryRaw<OperationalAlertRow[]>`
      SELECT id, dedupe_key AS "dedupeKey", alert_type AS "alertType",
             severity, source, status, reason_code AS "reasonCode",
             first_detected_at AS "firstDetectedAt", last_detected_at AS "lastDetectedAt",
             resolved_at AS "resolvedAt", occurrence_count AS "occurrenceCount",
             metadata, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM operational_alert_events
       WHERE status = 'ACTIVE'
       ORDER BY last_detected_at DESC`;
  }

  async findById(id: string): Promise<OperationalAlertRow | null> {
    const rows = await this.prisma.$queryRaw<OperationalAlertRow[]>`
      SELECT id, dedupe_key AS "dedupeKey", alert_type AS "alertType",
             severity, source, status, reason_code AS "reasonCode",
             first_detected_at AS "firstDetectedAt", last_detected_at AS "lastDetectedAt",
             resolved_at AS "resolvedAt", occurrence_count AS "occurrenceCount",
             metadata, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM operational_alert_events
       WHERE id = ${id}::uuid`;
    return rows[0] ?? null;
  }

  async listHistory(limit: number, status?: AlertStatus): Promise<OperationalAlertRow[]> {
    const capped = Math.min(200, Math.max(1, limit));
    const statusFilter = status ?? null;
    return this.prisma.$queryRaw<OperationalAlertRow[]>`
      SELECT id, dedupe_key AS "dedupeKey", alert_type AS "alertType",
             severity, source, status, reason_code AS "reasonCode",
             first_detected_at AS "firstDetectedAt", last_detected_at AS "lastDetectedAt",
             resolved_at AS "resolvedAt", occurrence_count AS "occurrenceCount",
             metadata, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM operational_alert_events
       WHERE (${statusFilter}::text IS NULL OR status = ${statusFilter}::text)
       ORDER BY last_detected_at DESC
       LIMIT ${capped}`;
  }

  async findActiveByDedupeKey(dedupeKey: string): Promise<OperationalAlertRow | null> {
    const rows = await this.prisma.$queryRaw<OperationalAlertRow[]>`
      SELECT id, dedupe_key AS "dedupeKey", alert_type AS "alertType",
             severity, source, status, reason_code AS "reasonCode",
             first_detected_at AS "firstDetectedAt", last_detected_at AS "lastDetectedAt",
             resolved_at AS "resolvedAt", occurrence_count AS "occurrenceCount",
             metadata, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM operational_alert_events
       WHERE dedupe_key = ${dedupeKey} AND status = 'ACTIVE' LIMIT 1`;
    return rows[0] ?? null;
  }

  async bumpActive(
    id: string,
    severity: string,
    reasonCode: string,
    metadata: string | null,
    nowIso: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE operational_alert_events
         SET last_detected_at = ${nowIso}::timestamptz,
             occurrence_count = occurrence_count + 1,
             severity = ${severity},
             reason_code = ${reasonCode},
             metadata = ${metadata}::jsonb,
             updated_at = NOW()
       WHERE id = ${id}::uuid`;
  }

  async insertActive(input: {
    dedupeKey: string;
    alertType: string;
    severity: string;
    source: string;
    reasonCode: string;
    metadata: string | null;
    nowIso: string;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO operational_alert_events
        (id, dedupe_key, alert_type, severity, source, status, reason_code,
         first_detected_at, last_detected_at, occurrence_count, metadata, created_at, updated_at)
      VALUES (gen_random_uuid(), ${input.dedupeKey}, ${input.alertType}, ${input.severity},
              ${input.source}, 'ACTIVE', ${input.reasonCode},
              ${input.nowIso}::timestamptz, ${input.nowIso}::timestamptz, 1,
              ${input.metadata}::jsonb, NOW(), NOW())`;
  }

  async resolveExcept(dedupeKeys: string[], nowIso: string): Promise<void> {
    if (dedupeKeys.length === 0) {
      await this.prisma.$executeRaw`
        UPDATE operational_alert_events
           SET status = 'RESOLVED', resolved_at = ${nowIso}::timestamptz, updated_at = NOW()
         WHERE status = 'ACTIVE'`;
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE operational_alert_events
         SET status = 'RESOLVED', resolved_at = ${nowIso}::timestamptz, updated_at = NOW()
       WHERE status = 'ACTIVE' AND NOT (dedupe_key = ANY(${dedupeKeys}::text[]))`;
  }
}

@Injectable()
export class OperationalAlertDetector {
  constructor(
    @Inject(OperationalAlertRepository)
    private readonly alerts: OperationalAlertRepository,
    @Inject(INGESTION_JOB_LOCK)
    private readonly lock: IJobLock,
  ) {}

  /**
   * Reconciles detected conditions against persisted ACTIVE alerts:
   * new keys activate, still-present keys bump occurrence, absent keys resolve.
   */
  async reconcile(
    conditions: readonly DetectedCondition[],
    nowIso: string = new Date().toISOString(),
  ): Promise<OperationalAlertRow[]> {
    const byKey = new Map<string, DetectedCondition>();
    for (const condition of conditions) {
      byKey.set(buildAlertDedupeKey(condition.alertType, condition.source), condition);
    }
    for (const dedupeKey of byKey.keys()) {
      await this.activateOrBump(dedupeKey, byKey.get(dedupeKey)!, nowIso);
    }
    await this.resolveCleared([...byKey.keys()], nowIso);
    return this.alerts.findActive();
  }

  private async activateOrBump(
    dedupeKey: string,
    condition: DetectedCondition,
    nowIso: string,
  ): Promise<void> {
    let handle: JobLockHandle | null = null;
    try {
      handle = await this.lock.tryAcquire(lockKeyFor(dedupeKey));
      if (!handle.acquired) return;
      const existing = await this.alerts.findActiveByDedupeKey(dedupeKey);
      const metadata = condition.metadata ? JSON.stringify(condition.metadata) : null;
      if (existing) {
        await this.alerts.bumpActive(
          existing.id,
          condition.severity,
          condition.reasonCode,
          metadata,
          nowIso,
        );
        return;
      }
      await this.alerts.insertActive({
        dedupeKey,
        alertType: condition.alertType,
        severity: condition.severity,
        source: condition.source,
        reasonCode: condition.reasonCode,
        metadata,
        nowIso,
      });
    } finally {
      if (handle) await handle.release().catch(() => undefined);
    }
  }

  private async resolveCleared(activeKeys: string[], nowIso: string): Promise<void> {
    await this.alerts.resolveExcept(activeKeys, nowIso);
  }
}
