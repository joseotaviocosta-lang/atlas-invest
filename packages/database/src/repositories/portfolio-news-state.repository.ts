import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { getPrismaClient } from '../client';
import type {
  IPortfolioNewsStateRepository,
  ListNewsAlertHistoryInput,
  ListNewsAlertHistoryOutput,
  NewsAlertDeliveryAuditItem,
  NewsAlertHistoryRecordRow,
  NewsAlertHistoryStatusValue,
  NewsAlertVersionRef,
  PersistedNewsEventStateValue,
  PersistedPortfolioNewsEventStateRow,
  PersistedPortfolioNewsSyncStateRow,
  UpsertPortfolioNewsEventStateInput,
} from './interfaces';

const VALID_STATES = new Set<PersistedNewsEventStateValue>(['NEW', 'UPDATED', 'SEEN', 'UNCHANGED']);

function parseStateValue(raw: string): PersistedNewsEventStateValue {
  if (VALID_STATES.has(raw as PersistedNewsEventStateValue)) {
    return raw as PersistedNewsEventStateValue;
  }
  return 'UNCHANGED';
}

function parseReasonsArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function parseMetaObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export class PortfolioNewsStateRepository implements IPortfolioNewsStateRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async loadSnapshot(portfolioId: string): Promise<{
    syncState: PersistedPortfolioNewsSyncStateRow | null;
    eventStates: PersistedPortfolioNewsEventStateRow[];
  }> {
    const [syncRow, eventRows] = await Promise.all([
      this.prisma.portfolioNewsSyncState.findUnique({
        where: { portfolioId },
      }),
      this.prisma.portfolioNewsEventStateRecord.findMany({
        where: { portfolioId },
        orderBy: [{ lastObservedAt: 'desc' }, { canonicalEventId: 'asc' }],
      }),
    ]);

    return {
      syncState: syncRow
        ? {
            portfolioId: syncRow.portfolioId,
            newsStateInitializedAt: syncRow.newsStateInitializedAt
              ? syncRow.newsStateInitializedAt.toISOString()
              : null,
            lastRefreshedAt: syncRow.lastRefreshedAt ? syncRow.lastRefreshedAt.toISOString() : null,
          }
        : null,
      eventStates: eventRows.map((row) => ({
        id: row.id,
        portfolioId: row.portfolioId,
        canonicalEventId: row.canonicalEventId,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastObservedAt: row.lastObservedAt.toISOString(),
        lastSeenByUserAt: row.lastSeenByUserAt ? row.lastSeenByUserAt.toISOString() : null,
        firstFingerprint: row.firstFingerprint,
        latestFingerprint: row.latestFingerprint,
        state: parseStateValue(row.state),
        latestUpdateReasons: parseReasonsArray(row.latestUpdateReasons),
        eventPublishedAt: row.eventPublishedAt ? row.eventPublishedAt.toISOString() : null,
        meta: parseMetaObject(row.snapshotMeta),
      })),
    };
  }

  async persistSnapshot(input: {
    portfolioId: string;
    syncState: PersistedPortfolioNewsSyncStateRow;
    items: UpsertPortfolioNewsEventStateInput[];
  }): Promise<void> {
    const { portfolioId, syncState, items } = input;
    const initDate = syncState.newsStateInitializedAt ? new Date(syncState.newsStateInitializedAt) : null;
    const refreshDate = syncState.lastRefreshedAt ? new Date(syncState.lastRefreshedAt) : new Date();

    await this.prisma.$transaction(async (tx) => {
      // Serialize state transitions per portfolio across concurrent processes
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news_state:${portfolioId}`}))`;

      await tx.$executeRaw`
        INSERT INTO "portfolio_news_sync_states" (
          "portfolio_id",
          "news_state_initialized_at",
          "last_refreshed_at",
          "created_at",
          "updated_at"
        )
        VALUES (
          ${portfolioId}::uuid,
          ${initDate}::timestamptz,
          ${refreshDate}::timestamptz,
          NOW(),
          NOW()
        )
        ON CONFLICT ("portfolio_id") DO UPDATE SET
          "news_state_initialized_at" = COALESCE("portfolio_news_sync_states"."news_state_initialized_at", EXCLUDED."news_state_initialized_at"),
          "last_refreshed_at" = GREATEST(COALESCE("portfolio_news_sync_states"."last_refreshed_at", EXCLUDED."last_refreshed_at"), EXCLUDED."last_refreshed_at"),
          "updated_at" = NOW()
      `;

      // Remove superseded alias canonical IDs when an event underwent ID consolidation (e.g. official promotion)
      const supersededIds = items
        .map((i) => i.previousCanonicalEventId)
        .filter((id): id is string => Boolean(id));

      if (supersededIds.length > 0) {
        await tx.portfolioNewsEventStateRecord.deleteMany({
          where: {
            portfolioId,
            canonicalEventId: { in: supersededIds },
          },
        });
      }

      if (items.length === 0) {
        return;
      }

      // Deduplicate items by canonicalEventId to prevent PostgreSQL error 21000
      // ("ON CONFLICT DO UPDATE command cannot affect row a second time")
      const dedupedByEventId = new Map<string, UpsertPortfolioNewsEventStateInput>();
      for (const item of items) {
        dedupedByEventId.set(item.canonicalEventId, item);
      }

      // Single-roundtrip bulk upsert via parameterized JSON payload (zero N+1 queries)
      const payload = Array.from(dedupedByEventId.values()).map((item) => ({
        id: randomUUID(),
        portfolio_id: portfolioId,
        canonical_event_id: item.canonicalEventId,
        first_seen_at: item.firstSeenAt,
        last_observed_at: item.lastObservedAt,
        last_seen_by_user_at: item.lastSeenByUserAt,
        first_fingerprint: item.firstFingerprint,
        latest_fingerprint: item.latestFingerprint,
        state: item.state,
        latest_update_reasons: item.latestUpdateReasons,
        event_published_at: item.eventPublishedAt,
        snapshot_meta: item.meta,
      }));

      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "portfolio_news_event_states" (
            "id",
            "portfolio_id",
            "canonical_event_id",
            "first_seen_at",
            "last_observed_at",
            "last_seen_by_user_at",
            "first_fingerprint",
            "latest_fingerprint",
            "state",
            "latest_update_reasons",
            "event_published_at",
            "snapshot_meta",
            "created_at",
            "updated_at"
          )
          SELECT
            (r->>'id')::uuid,
            (r->>'portfolio_id')::uuid,
            r->>'canonical_event_id',
            (r->>'first_seen_at')::timestamptz,
            (r->>'last_observed_at')::timestamptz,
            CASE WHEN r->>'last_seen_by_user_at' IS NULL OR r->>'last_seen_by_user_at' = '' THEN NULL ELSE (r->>'last_seen_by_user_at')::timestamptz END,
            r->>'first_fingerprint',
            r->>'latest_fingerprint',
            r->>'state',
            COALESCE(r->'latest_update_reasons', '[]'::jsonb),
            CASE WHEN r->>'event_published_at' IS NULL OR r->>'event_published_at' = '' THEN NULL ELSE (r->>'event_published_at')::timestamptz END,
            COALESCE(r->'snapshot_meta', '{}'::jsonb),
            NOW(),
            NOW()
          FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) AS r
          ON CONFLICT ("portfolio_id", "canonical_event_id") DO UPDATE SET
            "last_observed_at" = EXCLUDED."last_observed_at",
            "last_seen_by_user_at" = COALESCE(EXCLUDED."last_seen_by_user_at", "portfolio_news_event_states"."last_seen_by_user_at"),
            "latest_fingerprint" = EXCLUDED."latest_fingerprint",
            "state" = EXCLUDED."state",
            "latest_update_reasons" = EXCLUDED."latest_update_reasons",
            "event_published_at" = COALESCE(EXCLUDED."event_published_at", "portfolio_news_event_states"."event_published_at"),
            "snapshot_meta" = CASE
              WHEN "portfolio_news_event_states"."snapshot_meta"->>'alertedVersionFingerprint' = EXCLUDED."latest_fingerprint"
                AND COALESCE(EXCLUDED."snapshot_meta"->>'alertedVersionFingerprint', '') <> EXCLUDED."latest_fingerprint"
              THEN EXCLUDED."snapshot_meta" || jsonb_build_object(
                'alertedVersionFingerprint', "portfolio_news_event_states"."snapshot_meta"->'alertedVersionFingerprint',
                'alertedAt', "portfolio_news_event_states"."snapshot_meta"->'alertedAt'
              )
              ELSE EXCLUDED."snapshot_meta"
            END,
            "updated_at" = NOW()
        `,
      );
    });
  }

  async markSeen(input: {
    portfolioId: string;
    canonicalEventIds?: string[];
    markAllNovel?: boolean;
    seenAt: string;
  }): Promise<{ updatedCount: number; updatedIds: string[] }> {
    const { portfolioId, canonicalEventIds, markAllNovel = false, seenAt } = input;
    const seenDate = new Date(seenAt);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news_state:${portfolioId}`}))`;

      const targetRows = await tx.portfolioNewsEventStateRecord.findMany({
        where: {
          portfolioId,
          ...(markAllNovel && (!canonicalEventIds || canonicalEventIds.length === 0)
            ? { state: { in: ['NEW', 'UPDATED'] } }
            : canonicalEventIds && canonicalEventIds.length > 0
            ? { canonicalEventId: { in: canonicalEventIds } }
            : { id: { in: [] } }),
        },
        select: { canonicalEventId: true },
      });

      if (targetRows.length === 0) {
        return { updatedCount: 0, updatedIds: [] };
      }

      const idsToUpdate = targetRows.map((r) => r.canonicalEventId);

      const updateRes = await tx.portfolioNewsEventStateRecord.updateMany({
        where: {
          portfolioId,
          canonicalEventId: { in: idsToUpdate },
        },
        data: {
          state: 'SEEN',
          lastSeenByUserAt: seenDate,
          latestUpdateReasons: [],
        },
      });

      return {
        updatedCount: updateRes.count,
        updatedIds: idsToUpdate,
      };
    });
  }

  async claimPendingNewsAlerts(input: {
    portfolioId: string;
    candidates: NewsAlertVersionRef[];
    claimedAt: string;
    leaseMs?: number;
  }): Promise<{ claimed: NewsAlertVersionRef[]; skippedCount: number }> {
    const { portfolioId, candidates, claimedAt, leaseMs = 30_000 } = input;
    if (candidates.length === 0) {
      return { claimed: [], skippedCount: 0 };
    }

    const deduped = new Map<string, NewsAlertVersionRef>();
    for (const c of candidates) {
      if (c.canonicalEventId && c.eventVersionFingerprint) {
        deduped.set(c.canonicalEventId, c);
      }
    }
    const uniqueCandidates = Array.from(deduped.values());
    if (uniqueCandidates.length === 0) {
      return { claimed: [], skippedCount: candidates.length };
    }

    const claimedAtMs = Date.parse(claimedAt) || Date.now();
    const expiresAtIso = new Date(claimedAtMs + Math.max(1_000, leaseMs)).toISOString();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news_state:${portfolioId}`}))`;

      const rows = await tx.portfolioNewsEventStateRecord.findMany({
        where: {
          portfolioId,
          canonicalEventId: { in: uniqueCandidates.map((c) => c.canonicalEventId) },
        },
        select: {
          canonicalEventId: true,
          latestFingerprint: true,
          state: true,
          snapshotMeta: true,
        },
      });

      const rowById = new Map(rows.map((r) => [r.canonicalEventId, r]));
      const claimed: NewsAlertVersionRef[] = [];
      let skippedCount = 0;

      for (const cand of uniqueCandidates) {
        const row = rowById.get(cand.canonicalEventId);
        if (!row) {
          skippedCount++;
          continue;
        }
        if (row.state !== 'NEW' && row.state !== 'UPDATED') {
          skippedCount++;
          continue;
        }
        if (row.latestFingerprint !== cand.eventVersionFingerprint) {
          skippedCount++;
          continue;
        }

        const meta = parseMetaObject(row.snapshotMeta);
        if (meta.alertedVersionFingerprint === cand.eventVersionFingerprint) {
          skippedCount++;
          continue;
        }
        if (meta.alertBaselineVersionSuppressed === cand.eventVersionFingerprint) {
          skippedCount++;
          continue;
        }
        if (
          meta.alertClaimedFingerprint === cand.eventVersionFingerprint &&
          typeof meta.alertClaimExpiresAt === 'string'
        ) {
          const expiresMs = Date.parse(meta.alertClaimExpiresAt);
          if (Number.isFinite(expiresMs) && expiresMs > claimedAtMs) {
            skippedCount++;
            continue;
          }
        }

        claimed.push(cand);
      }

      if (claimed.length > 0) {
        const payload = claimed.map((c) => ({
          canonical_event_id: c.canonicalEventId,
          fingerprint: c.eventVersionFingerprint,
          expires_at: expiresAtIso,
        }));

        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "portfolio_news_event_states" AS t
            SET
              "snapshot_meta" = COALESCE(t."snapshot_meta", '{}'::jsonb) || jsonb_build_object(
                'alertClaimedFingerprint', r->>'fingerprint',
                'alertClaimExpiresAt', r->>'expires_at'
              ),
              "updated_at" = NOW()
            FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) AS r
            WHERE t."portfolio_id" = ${portfolioId}::uuid
              AND t."canonical_event_id" = r->>'canonical_event_id'
              AND t."latest_fingerprint" = r->>'fingerprint'
          `,
        );
      }

      return { claimed, skippedCount };
    });
  }

  private sanitizeFailureReason(raw?: string | null): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const firstLine = raw.split(/\r?\n/)[0] ?? '';
    const cleaned = firstLine
      .replace(/\b(bearer|token|secret|password|apikey|api_key)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned ? cleaned.slice(0, 480) : null;
  }

  private resolveAuditMetadataFromRow(
    item: NewsAlertDeliveryAuditItem,
    row:
      | {
          canonicalEventId: string;
          state: string;
          snapshotMeta: Prisma.JsonValue;
        }
      | undefined,
  ): {
    ticker: string;
    eventState: 'NEW' | 'UPDATED';
    materiality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';
    alertType:
      | 'CRITICAL_NEW'
      | 'CRITICAL_UPDATE'
      | 'MATERIAL_NEW'
      | 'MATERIAL_UPDATE'
      | 'MATERIAL_BATCH_SUMMARY';
    headlineSnapshot: string;
    materialityReasonSnapshot: string | null;
    sourceLabelSnapshot: string | null;
    batchEventCount: number;
    batchTickers: string[];
  } {
    const meta = row ? parseMetaObject(row.snapshotMeta) : {};
    const metaTickers = Array.isArray(meta.tickers)
      ? meta.tickers.filter((t): t is string => typeof t === 'string')
      : [];
    const ticker = (item.ticker?.trim() || metaTickers[0] || 'CARTEIRA').toUpperCase().slice(0, 32);

    const rawState = item.eventState ?? row?.state ?? 'NEW';
    const eventState: 'NEW' | 'UPDATED' = rawState === 'UPDATED' ? 'UPDATED' : 'NEW';

    const rawMat = item.materiality ?? (typeof meta.materiality === 'string' ? meta.materiality : 'HIGH');
    const validMats = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE']);
    const materiality = (
      validMats.has(rawMat) ? rawMat : 'HIGH'
    ) as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'ROUTINE';

    const batchEventCount = Math.max(1, item.batchEventCount ?? 1);
    const defaultAlertType =
      batchEventCount > 3 && materiality !== 'CRITICAL'
        ? 'MATERIAL_BATCH_SUMMARY'
        : materiality === 'CRITICAL'
          ? eventState === 'UPDATED'
            ? 'CRITICAL_UPDATE'
            : 'CRITICAL_NEW'
          : eventState === 'UPDATED'
            ? 'MATERIAL_UPDATE'
            : 'MATERIAL_NEW';

    const alertType = item.alertType ?? defaultAlertType;
    const headlineSnapshot = (item.headlineSnapshot?.trim() || item.canonicalEventId).slice(0, 500);
    const materialityReasonSnapshot = item.materialityReasonSnapshot
      ? item.materialityReasonSnapshot.trim().slice(0, 500)
      : null;
    const sourceLabelSnapshot = item.sourceLabelSnapshot
      ? item.sourceLabelSnapshot.trim().slice(0, 120)
      : meta.official === true
        ? 'CVM / B3'
        : null;
    const batchTickers =
      Array.isArray(item.batchTickers) && item.batchTickers.length > 0
        ? Array.from(new Set(item.batchTickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean)))
        : [ticker];

    return {
      ticker,
      eventState,
      materiality,
      alertType,
      headlineSnapshot,
      materialityReasonSnapshot,
      sourceLabelSnapshot,
      batchEventCount,
      batchTickers,
    };
  }

  async confirmNewsAlertsDelivered(input: {
    portfolioId: string;
    delivered: NewsAlertDeliveryAuditItem[];
    deliveredAt: string;
    alertAttemptId?: string;
    notificationId?: string | null;
  }): Promise<{
    confirmedCount: number;
    historyInsertedCount: number;
    duplicateSkippedCount: number;
  }> {
    const { portfolioId, delivered, deliveredAt, alertAttemptId, notificationId } = input;
    if (delivered.length === 0) {
      return { confirmedCount: 0, historyInsertedCount: 0, duplicateSkippedCount: 0 };
    }

    const deduped = Array.from(
      new Map(delivered.map((d) => [d.canonicalEventId, d])).values(),
    );

    const defaultAttemptId = alertAttemptId || randomUUID();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news_state:${portfolioId}`}))`;

      const existingRows = await tx.portfolioNewsEventStateRecord.findMany({
        where: {
          portfolioId,
          canonicalEventId: { in: deduped.map((d) => d.canonicalEventId) },
        },
        select: {
          canonicalEventId: true,
          latestFingerprint: true,
          state: true,
          snapshotMeta: true,
        },
      });
      const rowById = new Map(existingRows.map((r) => [r.canonicalEventId, r]));

      // Validate current fingerprint match against persisted state before marking delivered or writing history
      const validItems = deduped.filter((item) => {
        const row = rowById.get(item.canonicalEventId);
        return Boolean(row && row.latestFingerprint === item.eventVersionFingerprint);
      });

      if (validItems.length === 0) {
        return {
          confirmedCount: 0,
          historyInsertedCount: 0,
          duplicateSkippedCount: deduped.length,
        };
      }

      const payload = validItems.map((d) => ({
        canonical_event_id: d.canonicalEventId,
        fingerprint: d.eventVersionFingerprint,
        delivered_at: d.deliveredAt || deliveredAt,
      }));

      const updatedRows = await tx.$executeRaw(
        Prisma.sql`
          UPDATE "portfolio_news_event_states" AS t
          SET
            "snapshot_meta" = COALESCE(t."snapshot_meta", '{}'::jsonb) || jsonb_build_object(
              'alertedVersionFingerprint', r->>'fingerprint',
              'alertedAt', r->>'delivered_at',
              'alertClaimedFingerprint', NULL,
              'alertClaimExpiresAt', NULL
            ),
            "updated_at" = NOW()
          FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) AS r
          WHERE t."portfolio_id" = ${portfolioId}::uuid
            AND t."canonical_event_id" = r->>'canonical_event_id'
            AND t."latest_fingerprint" = r->>'fingerprint'
            AND COALESCE(t."snapshot_meta"->>'alertedVersionFingerprint', '') <> r->>'fingerprint'
        `,
      );

      const historyPayload = validItems.map((item) => {
        const row = rowById.get(item.canonicalEventId);
        const resolved = this.resolveAuditMetadataFromRow(item, row);
        const deliveredIso = item.deliveredAt || deliveredAt;
        const attemptedIso = item.attemptedAt || deliveredIso;
        return {
          id: randomUUID(),
          alert_attempt_id: item.alertAttemptId || defaultAttemptId,
          portfolio_id: portfolioId,
          canonical_event_id: item.canonicalEventId,
          event_version_fingerprint: item.eventVersionFingerprint,
          event_state: resolved.eventState,
          materiality: resolved.materiality,
          ticker: resolved.ticker,
          alert_type: resolved.alertType,
          delivery_status: 'DELIVERED',
          claimed_at: item.claimedAt || null,
          attempted_at: attemptedIso,
          delivered_at: deliveredIso,
          failure_reason: null,
          notification_id: (item.notificationId ?? notificationId ?? null)?.slice(0, 120) || null,
          headline_snapshot: resolved.headlineSnapshot,
          materiality_reason_snapshot: resolved.materialityReasonSnapshot,
          source_label_snapshot: resolved.sourceLabelSnapshot,
          batch_event_count: resolved.batchEventCount,
          batch_tickers: resolved.batchTickers,
        };
      });

      const insertedHistoryCount = await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "portfolio_news_alert_histories" (
            "id",
            "alert_attempt_id",
            "portfolio_id",
            "canonical_event_id",
            "event_version_fingerprint",
            "event_state",
            "materiality",
            "ticker",
            "alert_type",
            "delivery_status",
            "claimed_at",
            "attempted_at",
            "delivered_at",
            "failure_reason",
            "notification_id",
            "headline_snapshot",
            "materiality_reason_snapshot",
            "source_label_snapshot",
            "batch_event_count",
            "batch_tickers",
            "created_at"
          )
          SELECT
            (r->>'id')::uuid,
            (r->>'alert_attempt_id')::uuid,
            (r->>'portfolio_id')::uuid,
            r->>'canonical_event_id',
            r->>'event_version_fingerprint',
            r->>'event_state',
            r->>'materiality',
            r->>'ticker',
            r->>'alert_type',
            r->>'delivery_status',
            NULLIF(r->>'claimed_at', '')::timestamptz,
            (r->>'attempted_at')::timestamptz,
            NULLIF(r->>'delivered_at', '')::timestamptz,
            NULL,
            NULLIF(r->>'notification_id', ''),
            r->>'headline_snapshot',
            NULLIF(r->>'materiality_reason_snapshot', ''),
            NULLIF(r->>'source_label_snapshot', ''),
            GREATEST(1, COALESCE((r->>'batch_event_count')::integer, 1)),
            COALESCE(r->'batch_tickers', '[]'::jsonb),
            NOW()
          FROM jsonb_array_elements(${JSON.stringify(historyPayload)}::jsonb) AS r
          ON CONFLICT ("portfolio_id", "canonical_event_id", "event_version_fingerprint")
          WHERE "delivery_status" = 'DELIVERED'
          DO NOTHING
        `,
      );

      const confirmedCount = Number(updatedRows) || 0;
      const historyInsertedCount = Number(insertedHistoryCount) || 0;
      const duplicateSkippedCount = Math.max(0, deduped.length - historyInsertedCount);

      return {
        confirmedCount,
        historyInsertedCount,
        duplicateSkippedCount,
      };
    });
  }

  async releaseNewsAlertsClaim(input: {
    portfolioId: string;
    items: NewsAlertDeliveryAuditItem[];
    deliveryStatus?: Exclude<NewsAlertHistoryStatusValue, 'DELIVERED'>;
    failureReason?: string | null;
    attemptedAt?: string;
    alertAttemptId?: string;
    recordHistory?: boolean;
  }): Promise<{ releasedCount: number; historyInsertedCount: number }> {
    const {
      portfolioId,
      items,
      deliveryStatus,
      failureReason,
      attemptedAt,
      alertAttemptId,
      recordHistory,
    } = input;
    if (items.length === 0) {
      return { releasedCount: 0, historyInsertedCount: 0 };
    }

    const deduped = Array.from(
      new Map(items.map((d) => [d.canonicalEventId, d])).values(),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news_state:${portfolioId}`}))`;

      const payload = deduped.map((d) => ({
        canonical_event_id: d.canonicalEventId,
        fingerprint: d.eventVersionFingerprint,
      }));

      const updatedRows = await tx.$executeRaw(
        Prisma.sql`
          UPDATE "portfolio_news_event_states" AS t
          SET
            "snapshot_meta" = COALESCE(t."snapshot_meta", '{}'::jsonb) || jsonb_build_object(
              'alertClaimedFingerprint', NULL,
              'alertClaimExpiresAt', NULL
            ),
            "updated_at" = NOW()
          FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) AS r
          WHERE t."portfolio_id" = ${portfolioId}::uuid
            AND t."canonical_event_id" = r->>'canonical_event_id'
            AND COALESCE(t."snapshot_meta"->>'alertClaimedFingerprint', '') = r->>'fingerprint'
        `,
      );

      const shouldRecordAudit =
        recordHistory === true ||
        Boolean(deliveryStatus) ||
        deduped.some((i) => Boolean(i.deliveryStatus || i.headlineSnapshot || i.alertAttemptId));

      let historyInsertedCount = 0;
      if (shouldRecordAudit) {
        const existingRows = await tx.portfolioNewsEventStateRecord.findMany({
          where: {
            portfolioId,
            canonicalEventId: { in: deduped.map((d) => d.canonicalEventId) },
          },
          select: {
            canonicalEventId: true,
            latestFingerprint: true,
            state: true,
            snapshotMeta: true,
          },
        });
        const rowById = new Map(existingRows.map((r) => [r.canonicalEventId, r]));
        const fallbackAttemptId = alertAttemptId || randomUUID();
        const fallbackAttemptedAt = attemptedAt || new Date().toISOString();
        const fallbackStatus: NewsAlertHistoryStatusValue = deliveryStatus ?? 'DELIVERY_FAILED';

        const historyRows = deduped.map((item) => {
          const row = rowById.get(item.canonicalEventId);
          const resolved = this.resolveAuditMetadataFromRow(item, row);
          const rawReason = item.failureReason ?? failureReason ?? null;
          return {
            id: randomUUID(),
            alertAttemptId: item.alertAttemptId || fallbackAttemptId,
            portfolioId,
            canonicalEventId: item.canonicalEventId,
            eventVersionFingerprint: item.eventVersionFingerprint,
            eventState: resolved.eventState,
            materiality: resolved.materiality,
            ticker: resolved.ticker,
            alertType: resolved.alertType,
            deliveryStatus: item.deliveryStatus || fallbackStatus,
            claimedAt: item.claimedAt ? new Date(item.claimedAt) : null,
            attemptedAt: new Date(item.attemptedAt || fallbackAttemptedAt),
            deliveredAt: null,
            failureReason: this.sanitizeFailureReason(rawReason),
            notificationId: null,
            headlineSnapshot: resolved.headlineSnapshot,
            materialityReasonSnapshot: resolved.materialityReasonSnapshot,
            sourceLabelSnapshot: resolved.sourceLabelSnapshot,
            batchEventCount: resolved.batchEventCount,
            batchTickers: resolved.batchTickers,
          };
        });

        const createRes = await tx.portfolioNewsAlertHistoryRecord.createMany({
          data: historyRows,
        });
        historyInsertedCount = createRes.count;
      }

      return {
        releasedCount: Number(updatedRows) || 0,
        historyInsertedCount,
      };
    });
  }

  async listAlertHistory(input: ListNewsAlertHistoryInput): Promise<ListNewsAlertHistoryOutput> {
    const limit = Math.min(Math.max(1, input.limit ?? 25), 100);

    const baseWhere: Prisma.PortfolioNewsAlertHistoryRecordWhereInput = {
      portfolioId: input.portfolioId,
    };

    if (input.status) {
      baseWhere.deliveryStatus = input.status;
    }
    if (input.ticker) {
      baseWhere.ticker = input.ticker.trim().toUpperCase();
    }
    if (input.materiality) {
      baseWhere.materiality = input.materiality;
    }
    if (input.alertType) {
      baseWhere.alertType = input.alertType;
    }

    if (input.from || input.to) {
      const attemptedAtFilter: Prisma.DateTimeFilter = {};
      if (input.from) {
        const fromIso = /^\d{4}-\d{2}-\d{2}$/.test(input.from)
          ? `${input.from}T00:00:00.000Z`
          : input.from;
        attemptedAtFilter.gte = new Date(fromIso);
      }
      if (input.to) {
        const toIso = /^\d{4}-\d{2}-\d{2}$/.test(input.to)
          ? `${input.to}T23:59:59.999Z`
          : input.to;
        attemptedAtFilter.lte = new Date(toIso);
      }
      baseWhere.attemptedAt = attemptedAtFilter;
    }

    let cursorWhere: Prisma.PortfolioNewsAlertHistoryRecordWhereInput | undefined;
    if (input.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(input.cursor, 'base64url').toString('utf8'),
        ) as { attemptedAt?: string; id?: string };
        if (decoded.attemptedAt && decoded.id) {
          const cursorDate = new Date(decoded.attemptedAt);
          if (!Number.isNaN(cursorDate.getTime())) {
            cursorWhere = {
              OR: [
                { attemptedAt: { lt: cursorDate } },
                {
                  AND: [{ attemptedAt: cursorDate }, { id: { lt: decoded.id } }],
                },
              ],
            };
          }
        }
      } catch {
        // Ignore malformed cursor gracefully and start from page 1
      }
    }

    const queryWhere: Prisma.PortfolioNewsAlertHistoryRecordWhereInput = cursorWhere
      ? { AND: [baseWhere, cursorWhere] }
      : baseWhere;

    const [rows, totalCount, deliveredCount, failedCount, criticalCount, highCount, earliestRow] =
      await Promise.all([
        this.prisma.portfolioNewsAlertHistoryRecord.findMany({
          where: queryWhere,
          orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        this.prisma.portfolioNewsAlertHistoryRecord.count({ where: baseWhere }),
        this.prisma.portfolioNewsAlertHistoryRecord.count({
          where: { ...baseWhere, deliveryStatus: 'DELIVERED' },
        }),
        this.prisma.portfolioNewsAlertHistoryRecord.count({
          where: { ...baseWhere, deliveryStatus: { not: 'DELIVERED' } },
        }),
        this.prisma.portfolioNewsAlertHistoryRecord.count({
          where: { ...baseWhere, materiality: 'CRITICAL' },
        }),
        this.prisma.portfolioNewsAlertHistoryRecord.count({
          where: { ...baseWhere, materiality: 'HIGH' },
        }),
        this.prisma.portfolioNewsAlertHistoryRecord.aggregate({
          where: { portfolioId: input.portfolioId },
          _min: { attemptedAt: true },
        }),
      ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(
            JSON.stringify({
              attemptedAt: lastRow.attemptedAt.toISOString(),
              id: lastRow.id,
            }),
            'utf8',
          ).toString('base64url')
        : null;

    const items: NewsAlertHistoryRecordRow[] = pageRows.map((row) => ({
      id: row.id,
      alertAttemptId: row.alertAttemptId,
      ticker: row.ticker,
      canonicalEventId: row.canonicalEventId,
      eventVersionFingerprint: row.eventVersionFingerprint,
      eventState: row.eventState === 'UPDATED' ? 'UPDATED' : 'NEW',
      materiality: row.materiality as NewsAlertHistoryRecordRow['materiality'],
      alertType: row.alertType as NewsAlertHistoryRecordRow['alertType'],
      deliveryStatus: row.deliveryStatus as NewsAlertHistoryStatusValue,
      headline: row.headlineSnapshot,
      materialityReason: row.materialityReasonSnapshot,
      sourceLabel: row.sourceLabelSnapshot,
      notificationId: row.notificationId,
      batchEventCount: row.batchEventCount,
      batchTickers: Array.isArray(row.batchTickers)
        ? row.batchTickers.filter((t): t is string => typeof t === 'string')
        : [],
      claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
      attemptedAt: row.attemptedAt.toISOString(),
      deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      failureReason: row.failureReason,
    }));

    return {
      items,
      nextCursor,
      hasMore,
      metrics: {
        totalCount,
        deliveredCount,
        failedCount,
        criticalCount,
        highCount,
      },
      historyAvailableSince: earliestRow._min.attemptedAt
        ? earliestRow._min.attemptedAt.toISOString()
        : null,
    };
  }

  async suppressNewsAlertsBaseline(input: {
    portfolioId: string;
    items: NewsAlertVersionRef[];
    recordedAt: string;
  }): Promise<{ suppressedCount: number }> {
    const { portfolioId, items, recordedAt } = input;
    if (items.length === 0) {
      return { suppressedCount: 0 };
    }

    const deduped = Array.from(
      new Map(items.map((d) => [d.canonicalEventId, d])).values(),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news_state:${portfolioId}`}))`;

      const payload = deduped.map((d) => ({
        canonical_event_id: d.canonicalEventId,
        fingerprint: d.eventVersionFingerprint,
        recorded_at: recordedAt,
      }));

      const updatedRows = await tx.$executeRaw(
        Prisma.sql`
          UPDATE "portfolio_news_event_states" AS t
          SET
            "snapshot_meta" = COALESCE(t."snapshot_meta", '{}'::jsonb) || jsonb_build_object(
              'alertBaselineVersionSuppressed', r->>'fingerprint',
              'alertBaselineRecordedAt', COALESCE(t."snapshot_meta"->>'alertBaselineRecordedAt', r->>'recorded_at')
            ),
            "updated_at" = NOW()
          FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) AS r
          WHERE t."portfolio_id" = ${portfolioId}::uuid
            AND t."canonical_event_id" = r->>'canonical_event_id'
            AND t."latest_fingerprint" = r->>'fingerprint'
            AND COALESCE(t."snapshot_meta"->>'alertedVersionFingerprint', '') <> r->>'fingerprint'
        `,
      );

      return { suppressedCount: Number(updatedRows) || 0 };
    });
  }
}
