import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  cleanDatabase,
  getTestPrismaClient,
  disconnectTestDatabase,
  TEST_DATABASE_URL,
} from './setup';
import { PortfolioNewsStateRepository } from '../../packages/database/src/index';
import {
  applyPortfolioNewsState,
  selectAlertEligibleNewsEvents,
  type PortfolioNewsEvent,
} from '../../packages/market-data/src/index';

function buildEvent(overrides: Partial<PortfolioNewsEvent> = {}): PortfolioNewsEvent {
  const ticker = overrides.primaryTickers?.[0] ?? overrides.assets?.[0] ?? 'PETR4';
  return {
    id: overrides.id ?? `evt_${ticker}_1`,
    canonicalEventId: overrides.canonicalEventId ?? overrides.id ?? `evt_${ticker}_1`,
    headline: overrides.headline ?? `${ticker}: Fato Relevante — Distribuição aprovada`,
    summary: overrides.summary ?? 'Comunicado oficial protocolado.',
    publishedAt: overrides.publishedAt ?? '2026-11-11T10:00:00.000Z',
    importance: overrides.importance ?? 5,
    sentiment: overrides.sentiment ?? 'POSITIVE',
    sentimentScore: 0.85,
    sentimentMethod: 'OFFICIAL_EVENT_RULE',
    eventType: overrides.eventType ?? 'FACT_RELEVANT',
    assets: overrides.assets ?? [ticker],
    primaryTickers: overrides.primaryTickers ?? [ticker],
    secondaryTickers: [],
    sources: overrides.sources ?? [{ name: 'CVM', url: `https://rad.cvm.gov.br/${ticker}` }],
    provider: overrides.provider ?? 'CVM',
    sourceType: 'OFFICIAL_REGULATORY',
    official: overrides.official ?? true,
    freshness: 'BREAKING',
    decayWeight: 1.0,
    materiality: overrides.materiality ?? 'HIGH',
    materialityScore: 85,
    materialityReason: overrides.materialityReason ?? 'Evento relevante financeiro confirmado',
    ...overrides,
  };
}

describe('PROJECT ATLAS — APP-16O: Material News Alert History Persistence (Postgres)', () => {
  const prisma = getTestPrismaClient();
  const repo = new PortfolioNewsStateRepository(prisma);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function seedPortfolio(suffix: string): Promise<{ userId: string; portfolioId: string }> {
    const userId = randomUUID();
    const portfolioId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `app16o-${suffix}@atlas.dev`,
        name: `App16O ${suffix}`,
        passwordHash: 'hash_not_used',
      },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: `Portfolio ${suffix}`,
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    return { userId, portfolioId };
  }

  async function seedBaselineAndNewEvents(portfolioId: string, events: PortfolioNewsEvent[]) {
    const seed = applyPortfolioNewsState({
      portfolioId,
      events: [
        buildEvent({
          id: `seed_init_${portfolioId.slice(0, 6)}`,
          canonicalEventId: `seed_init_${portfolioId.slice(0, 6)}`,
          assets: ['SEED3'],
          primaryTickers: ['SEED3'],
          headline: 'SEED3 Baseline event',
        }),
      ],
      persistedStates: [],
      syncState: null,
      referenceDate: new Date('2026-11-10T10:00:00.000Z'),
    });
    await repo.persistSnapshot({
      portfolioId,
      syncState: seed.syncStateToPersist,
      items: seed.statesToUpsert,
    });

    const snap = await repo.loadSnapshot(portfolioId);
    const s1 = applyPortfolioNewsState({
      portfolioId,
      events,
      persistedStates: snap.eventStates,
      syncState: snap.syncState,
      referenceDate: new Date('2026-11-11T10:00:00.000Z'),
    });
    await repo.persistSnapshot({
      portfolioId,
      syncState: s1.syncStateToPersist,
      items: s1.statesToUpsert,
    });
    return s1;
  }

  it('BA & BB & BL: Records DELIVERED history atomically with state, creates 2 rows across version updates, and survives PrismaClient restart', async () => {
    const { portfolioId } = await seedPortfolio('delivered-update-restart');
    const ev1 = buildEvent({ id: 'evt_petr4_upd', canonicalEventId: 'evt_petr4_upd', primaryTickers: ['PETR4'], assets: ['PETR4'] });
    const s1 = await seedBaselineAndNewEvents(portfolioId, [ev1]);

    const sel1 = selectAlertEligibleNewsEvents({ portfolioId, events: s1.events, persistedStates: s1.statesToUpsert });
    const cand1 = sel1.eligibleCandidates[0]!;
    await repo.claimPendingNewsAlerts({
      portfolioId,
      candidates: [{ canonicalEventId: cand1.canonicalEventId, eventVersionFingerprint: cand1.eventVersionFingerprint }],
      claimedAt: '2026-11-11T10:00:01.000Z',
    });

    const attempt1 = randomUUID();
    const confirm1 = await repo.confirmNewsAlertsDelivered({
      portfolioId,
      deliveredAt: '2026-11-11T10:00:02.000Z',
      alertAttemptId: attempt1,
      notificationId: 'notif_v1',
      delivered: [
        {
          canonicalEventId: cand1.canonicalEventId,
          eventVersionFingerprint: cand1.eventVersionFingerprint,
          ticker: 'PETR4',
          eventState: 'NEW',
          materiality: 'HIGH',
          alertType: 'MATERIAL_NEW',
          headlineSnapshot: cand1.headline,
          materialityReasonSnapshot: cand1.materialityReason ?? null,
          sourceLabelSnapshot: 'CVM',
          claimedAt: '2026-11-11T10:00:01.000Z',
          attemptedAt: '2026-11-11T10:00:02.000Z',
          deliveredAt: '2026-11-11T10:00:02.000Z',
        },
      ],
    });

    expect(confirm1.confirmedCount).toBe(1);
    expect(confirm1.historyInsertedCount).toBe(1);

    // BB: Material update arrives -> NEW fingerprint B
    const snap2 = await repo.loadSnapshot(portfolioId);
    const ev2 = buildEvent({
      id: 'evt_petr4_upd',
      canonicalEventId: 'evt_petr4_upd',
      headline: 'PETR4: Fato Relevante Retificado — Valor Revisado',
      materiality: 'CRITICAL',
      materialityReason: 'Revisão relevante de guidance',
      primaryTickers: ['PETR4'],
      assets: ['PETR4'],
    });
    const s2 = applyPortfolioNewsState({
      portfolioId,
      events: [ev2],
      persistedStates: snap2.eventStates,
      syncState: snap2.syncState,
      referenceDate: new Date('2026-11-11T11:00:00.000Z'),
    });
    await repo.persistSnapshot({ portfolioId, syncState: s2.syncStateToPersist, items: s2.statesToUpsert });
    const cand2 = selectAlertEligibleNewsEvents({ portfolioId, events: s2.events, persistedStates: s2.statesToUpsert }).eligibleCandidates[0]!;
    expect(cand2.eventVersionFingerprint).not.toBe(cand1.eventVersionFingerprint);

    await repo.confirmNewsAlertsDelivered({
      portfolioId,
      deliveredAt: '2026-11-11T11:00:02.000Z',
      notificationId: 'notif_v2',
      delivered: [
        {
          canonicalEventId: cand2.canonicalEventId,
          eventVersionFingerprint: cand2.eventVersionFingerprint,
          ticker: 'PETR4',
          eventState: 'UPDATED',
          materiality: 'CRITICAL',
          alertType: 'CRITICAL_UPDATE',
          headlineSnapshot: ev2.headline,
          materialityReasonSnapshot: ev2.materialityReason ?? null,
          sourceLabelSnapshot: 'CVM',
          attemptedAt: '2026-11-11T11:00:02.000Z',
          deliveredAt: '2026-11-11T11:00:02.000Z',
        },
      ],
    });

    // BL: Fresh PrismaClient restart sees both version rows
    const freshPrisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await freshPrisma.$connect();
    try {
      const freshRepo = new PortfolioNewsStateRepository(freshPrisma);
      const history = await freshRepo.listAlertHistory({ portfolioId, limit: 20 });
      expect(history.items).toHaveLength(2);
      expect(history.items[0]!.eventVersionFingerprint).toBe(cand2.eventVersionFingerprint);
      expect(history.items[0]!.eventState).toBe('UPDATED');
      expect(history.items[0]!.materiality).toBe('CRITICAL');
      expect(history.items[1]!.eventVersionFingerprint).toBe(cand1.eventVersionFingerprint);
      expect(history.items[1]!.eventState).toBe('NEW');
      expect(history.items[1]!.sourceLabel).toBe('CVM');
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('BC & BD: Records DELIVERY_FAILED -> retry DELIVERED sequence and PERMISSION_DENIED without marking alertedVersionFingerprint', async () => {
    const { portfolioId } = await seedPortfolio('retry-and-denied');
    const evFail = buildEvent({ id: 'evt_vale_fail', canonicalEventId: 'evt_vale_fail', primaryTickers: ['VALE3'], assets: ['VALE3'] });
    const evPerm = buildEvent({ id: 'evt_itub_perm', canonicalEventId: 'evt_itub_perm', primaryTickers: ['ITUB4'], assets: ['ITUB4'] });
    const s1 = await seedBaselineAndNewEvents(portfolioId, [evFail, evPerm]);
    const cands = selectAlertEligibleNewsEvents({ portfolioId, events: s1.events, persistedStates: s1.statesToUpsert }).eligibleCandidates;
    const vale = cands.find((c) => c.ticker === 'VALE3')!;
    const itub = cands.find((c) => c.ticker === 'ITUB4')!;

    // Claim + Failed attempt 1
    await repo.claimPendingNewsAlerts({
      portfolioId,
      candidates: [{ canonicalEventId: vale.canonicalEventId, eventVersionFingerprint: vale.eventVersionFingerprint }],
      claimedAt: '2026-11-11T10:00:01.000Z',
    });
    await repo.releaseNewsAlertsClaim({
      portfolioId,
      deliveryStatus: 'DELIVERY_FAILED',
      failureReason: 'COM toast channel busy',
      attemptedAt: '2026-11-11T10:00:02.000Z',
      recordHistory: true,
      items: [
        {
          canonicalEventId: vale.canonicalEventId,
          eventVersionFingerprint: vale.eventVersionFingerprint,
          ticker: 'VALE3',
          eventState: 'NEW',
          materiality: 'HIGH',
          alertType: 'MATERIAL_NEW',
          headlineSnapshot: vale.headline,
          attemptedAt: '2026-11-11T10:00:02.000Z',
        },
      ],
    });

    // Retry claim + DELIVERED attempt 2
    const retryClaim = await repo.claimPendingNewsAlerts({
      portfolioId,
      candidates: [{ canonicalEventId: vale.canonicalEventId, eventVersionFingerprint: vale.eventVersionFingerprint }],
      claimedAt: '2026-11-11T10:01:00.000Z',
    });
    expect(retryClaim.claimed).toHaveLength(1);

    await repo.confirmNewsAlertsDelivered({
      portfolioId,
      deliveredAt: '2026-11-11T10:01:02.000Z',
      delivered: [
        {
          canonicalEventId: vale.canonicalEventId,
          eventVersionFingerprint: vale.eventVersionFingerprint,
          ticker: 'VALE3',
          eventState: 'NEW',
          materiality: 'HIGH',
          alertType: 'MATERIAL_NEW',
          headlineSnapshot: vale.headline,
          attemptedAt: '2026-11-11T10:01:02.000Z',
        },
      ],
    });

    // BD: Permission denied on ITUB4
    await repo.releaseNewsAlertsClaim({
      portfolioId,
      deliveryStatus: 'PERMISSION_DENIED',
      failureReason: 'Windows notifications permission denied',
      attemptedAt: '2026-11-11T10:02:00.000Z',
      recordHistory: true,
      items: [
        {
          canonicalEventId: itub.canonicalEventId,
          eventVersionFingerprint: itub.eventVersionFingerprint,
          ticker: 'ITUB4',
          eventState: 'NEW',
          materiality: 'HIGH',
          alertType: 'MATERIAL_NEW',
          headlineSnapshot: itub.headline,
        },
      ],
    });

    const snapAfter = await repo.loadSnapshot(portfolioId);
    const itubRow = snapAfter.eventStates.find((r) => r.canonicalEventId === 'evt_itub_perm');
    expect(itubRow?.meta.alertedVersionFingerprint).toBeNull();

    const valeHistory = await repo.listAlertHistory({ portfolioId, ticker: 'VALE3' });
    expect(valeHistory.items.map((i) => i.deliveryStatus)).toEqual(['DELIVERED', 'DELIVERY_FAILED']);
    expect(valeHistory.items[1]!.failureReason).toBe('COM toast channel busy');

    const deniedHistory = await repo.listAlertHistory({ portfolioId, status: 'PERMISSION_DENIED' });
    expect(deniedHistory.items).toHaveLength(1);
    expect(deniedHistory.items[0]!.ticker).toBe('ITUB4');
  });

  it('BE & BF: Duplicate & concurrent confirmNewsAlertsDelivered produce strictly ONE DELIVERED history row', async () => {
    const { portfolioId } = await seedPortfolio('concurrent-confirm');
    const ev = buildEvent({ id: 'evt_conc_ok', canonicalEventId: 'evt_conc_ok', primaryTickers: ['WEGE3'], assets: ['WEGE3'] });
    const s1 = await seedBaselineAndNewEvents(portfolioId, [ev]);
    const fp = s1.events[0]!.eventVersionFingerprint!;

    const [r1, r2, r3] = await Promise.all([
      repo.confirmNewsAlertsDelivered({
        portfolioId,
        deliveredAt: '2026-11-11T12:00:00.000Z',
        delivered: [{ canonicalEventId: 'evt_conc_ok', eventVersionFingerprint: fp, ticker: 'WEGE3', headlineSnapshot: ev.headline }],
      }),
      repo.confirmNewsAlertsDelivered({
        portfolioId,
        deliveredAt: '2026-11-11T12:00:00.000Z',
        delivered: [{ canonicalEventId: 'evt_conc_ok', eventVersionFingerprint: fp, ticker: 'WEGE3', headlineSnapshot: ev.headline }],
      }),
      repo.confirmNewsAlertsDelivered({
        portfolioId,
        deliveredAt: '2026-11-11T12:00:00.000Z',
        delivered: [{ canonicalEventId: 'evt_conc_ok', eventVersionFingerprint: fp, ticker: 'WEGE3', headlineSnapshot: ev.headline }],
      }),
    ]);

    expect(r1.historyInsertedCount + r2.historyInsertedCount + r3.historyInsertedCount).toBe(1);

    // Sequential duplicate confirm also inserts 0 additional rows
    const dup = await repo.confirmNewsAlertsDelivered({
      portfolioId,
      deliveredAt: '2026-11-11T12:05:00.000Z',
      delivered: [{ canonicalEventId: 'evt_conc_ok', eventVersionFingerprint: fp, ticker: 'WEGE3', headlineSnapshot: ev.headline }],
    });
    expect(dup.historyInsertedCount).toBe(0);

    const history = await repo.listAlertHistory({ portfolioId });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]!.deliveryStatus).toBe('DELIVERED');
  });

  it('BG, BH, BI, BJ, BK & AX/AY: Batch links, CRITICAL individual, portfolio isolation, cursor pagination, filters, and zero fabricated history', async () => {
    const pA = await seedPortfolio('batch-pag-A');
    const pB = await seedPortfolio('isolated-B');

    const tickers = ['PETR4', 'VALE3', 'BBAS3', 'ITUB4', 'WEGE3'] as const;
    const highEvents = tickers.map((t, idx) =>
      buildEvent({
        id: `evt_b_${idx}`,
        canonicalEventId: `evt_b_${idx}`,
        primaryTickers: [t],
        assets: [t],
        headline: `${t}: Fato Relevante ${idx}`,
      }),
    );
    const critEvent = buildEvent({
      id: 'evt_crit_alone',
      canonicalEventId: 'evt_crit_alone',
      materiality: 'CRITICAL',
      primaryTickers: ['BBDC4'],
      assets: ['BBDC4'],
      headline: 'BBDC4: Evento Crítico Regulatório',
    });

    // Insert pre-16O row with alertedVersionFingerprint directly -> must NOT fabricate history rows
    await prisma.portfolioNewsSyncState.create({
      data: {
        portfolioId: pA.portfolioId,
        newsStateInitializedAt: new Date('2026-11-09T00:00:00.000Z'),
        lastRefreshedAt: new Date('2026-11-10T00:00:00.000Z'),
      },
    });
    await prisma.portfolioNewsEventStateRecord.create({
      data: {
        id: randomUUID(),
        portfolioId: pA.portfolioId,
        canonicalEventId: 'evt_pre16o',
        firstSeenAt: new Date('2026-11-10T00:00:00.000Z'),
        lastObservedAt: new Date('2026-11-10T00:00:00.000Z'),
        firstFingerprint: 'fp_old_pre16o',
        latestFingerprint: 'fp_old_pre16o',
        state: 'NEW',
        latestUpdateReasons: [],
        snapshotMeta: { alertedVersionFingerprint: 'fp_old_pre16o', alertedAt: '2026-11-10T01:00:00.000Z' },
      },
    });

    const snapA = await repo.loadSnapshot(pA.portfolioId);
    const sA = applyPortfolioNewsState({
      portfolioId: pA.portfolioId,
      events: [critEvent, ...highEvents],
      persistedStates: snapA.eventStates,
      syncState: snapA.syncState,
      referenceDate: new Date('2026-11-11T14:00:00.000Z'),
    });
    await repo.persistSnapshot({ portfolioId: pA.portfolioId, syncState: sA.syncStateToPersist, items: sA.statesToUpsert });

    const preConfirmHistory = await repo.listAlertHistory({ portfolioId: pA.portfolioId });
    expect(preConfirmHistory.items).toHaveLength(0); // AX / AY: zero fabricated pre-16O history!

    const batchAttemptId = randomUUID();
    await repo.confirmNewsAlertsDelivered({
      portfolioId: pA.portfolioId,
      deliveredAt: '2026-11-11T14:00:02.000Z',
      alertAttemptId: batchAttemptId,
      notificationId: 'notif_batch_5',
      delivered: sA.statesToUpsert
        .filter((s) => s.canonicalEventId.startsWith('evt_b_'))
        .map((s, idx) => ({
          canonicalEventId: s.canonicalEventId,
          eventVersionFingerprint: s.latestFingerprint,
          ticker: tickers[idx]!,
          eventState: 'NEW' as const,
          materiality: 'HIGH' as const,
          alertType: 'MATERIAL_BATCH_SUMMARY' as const,
          headlineSnapshot: `${tickers[idx]}: Fato Relevante ${idx}`,
          batchEventCount: 5,
          batchTickers: [...tickers],
          attemptedAt: `2026-11-11T14:00:0${idx}.000Z`,
          deliveredAt: `2026-11-11T14:00:0${idx}.000Z`,
        })),
    });

    const critRow = sA.statesToUpsert.find((s) => s.canonicalEventId === 'evt_crit_alone')!;
    await repo.confirmNewsAlertsDelivered({
      portfolioId: pA.portfolioId,
      deliveredAt: '2026-11-11T14:05:00.000Z',
      notificationId: 'notif_crit_1',
      delivered: [
        {
          canonicalEventId: critRow.canonicalEventId,
          eventVersionFingerprint: critRow.latestFingerprint,
          ticker: 'BBDC4',
          eventState: 'NEW',
          materiality: 'CRITICAL',
          alertType: 'CRITICAL_NEW',
          headlineSnapshot: critEvent.headline,
          batchEventCount: 1,
          batchTickers: ['BBDC4'],
          attemptedAt: '2026-11-11T14:05:00.000Z',
        },
      ],
    });

    // BI: Portfolio B sees zero items
    const histB = await repo.listAlertHistory({ portfolioId: pB.portfolioId });
    expect(histB.items).toHaveLength(0);

    // BJ: Deterministic cursor pagination across all 6 items (page size 2 -> 3 pages, zero dups)
    const p1 = await repo.listAlertHistory({ portfolioId: pA.portfolioId, limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.items[0]!.ticker).toBe('BBDC4');
    expect(p1.items[0]!.alertType).toBe('CRITICAL_NEW');

    const p2 = await repo.listAlertHistory({ portfolioId: pA.portfolioId, limit: 2, cursor: p1.nextCursor! });
    const p3 = await repo.listAlertHistory({ portfolioId: pA.portfolioId, limit: 2, cursor: p2.nextCursor! });
    expect(p3.hasMore).toBe(false);

    const allIds = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(6);

    // BG: All 5 batch rows share batchEventCount=5 & alertAttemptId & notificationId
    const batchItems = [...p1.items, ...p2.items, ...p3.items].filter(
      (i) => i.alertType === 'MATERIAL_BATCH_SUMMARY',
    );
    expect(batchItems).toHaveLength(5);
    expect(new Set(batchItems.map((b) => b.alertAttemptId)).size).toBe(1);
    expect(new Set(batchItems.map((b) => b.notificationId)).size).toBe(1);
    expect(batchItems.every((b) => b.batchEventCount === 5)).toBe(true);

    // BK: Filters (ticker, materiality, date range)
    const petrFiltered = await repo.listAlertHistory({ portfolioId: pA.portfolioId, ticker: 'petr4' });
    expect(petrFiltered.items).toHaveLength(1);

    const critFiltered = await repo.listAlertHistory({
      portfolioId: pA.portfolioId,
      materiality: 'CRITICAL',
      from: '2026-11-11',
      to: '2026-11-11',
    });
    expect(critFiltered.items).toHaveLength(1);
    expect(critFiltered.metrics.criticalCount).toBe(1);
  });
});
