import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { getPrismaClient } from '../client';
import type {
  IPortfolioNewsStateRepository,
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
            "snapshot_meta" = EXCLUDED."snapshot_meta",
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
}
