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
  deliverMaterialNewsAlerts,
  FakeNewsAlertNotifier,
  type PortfolioNewsEvent,
} from '../../packages/market-data/src/index';

function buildRealEvent(overrides: Partial<PortfolioNewsEvent> = {}): PortfolioNewsEvent {
  return {
    id: overrides.id ?? 'cvm_event_petr4_01',
    canonicalEventId: overrides.canonicalEventId ?? overrides.id ?? 'cvm_event_petr4_01',
    headline: overrides.headline ?? 'PETROBRAS (PETR4): Fato Relevante — Dividendo Extraordinário',
    summary: overrides.summary ?? 'Conselho aprova distribuição de proventos extraordinários.',
    publishedAt: overrides.publishedAt ?? '2026-11-11T10:00:00.000Z',
    importance: overrides.importance ?? 5,
    sentiment: overrides.sentiment ?? 'POSITIVE',
    sentimentScore: overrides.sentimentScore ?? 0.85,
    sentimentMethod: overrides.sentimentMethod ?? 'OFFICIAL_EVENT_RULE',
    eventType: overrides.eventType ?? 'FACT_RELEVANT',
    assets: overrides.assets ?? ['PETR4'],
    primaryTickers: overrides.primaryTickers ?? ['PETR4'],
    secondaryTickers: [],
    sources: overrides.sources ?? [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc/12345' }],
    provider: overrides.provider ?? 'CVM',
    sourceType: overrides.sourceType ?? 'OFFICIAL_REGULATORY',
    official: overrides.official ?? true,
    freshness: 'BREAKING',
    decayWeight: 1.0,
    materiality: overrides.materiality ?? 'HIGH',
    materialityScore: 84,
    materialityReason: 'Provento relevante aprovado por conselho',
    ...overrides,
  };
}

describe('PROJECT ATLAS — APP-16N: Portfolio News Alerts Persistence & Concurrency (Postgres)', () => {
  const prisma = getTestPrismaClient();
  const repo = new PortfolioNewsStateRepository(prisma);

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function seedUserAndPortfolio(label: string) {
    const userId = randomUUID();
    const portfolioId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${label}-${userId.slice(0, 8)}@atlas.local`,
        name: `Investor ${label}`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    await prisma.portfolio.create({
      data: {
        id: portfolioId,
        userId,
        name: `Portfolio ${label}`,
        baseCurrency: 'BRL',
        type: 'INDIVIDUAL',
        status: 'ACTIVE',
      },
    });
    return { userId, portfolioId };
  }

  it('1. Persists delivered alert fingerprint across full PrismaClient restart and blocks duplicate alerts; material update alerts once again', async () => {
    const { portfolioId } = await seedUserAndPortfolio('restart');

    // Establish initial portfolio baseline so next arriving event is genuinely NEW
    const seedEvent = buildRealEvent({ id: 'evt_seed', canonicalEventId: 'evt_seed' });
    const s0 = applyPortfolioNewsState({
      portfolioId,
      events: [seedEvent],
      persistedStates: [],
      syncState: null,
      referenceDate: new Date('2026-11-10T10:00:00.000Z'),
    });
    await repo.persistSnapshot({
      portfolioId,
      syncState: s0.syncStateToPersist,
      items: s0.statesToUpsert,
    });

    // New HIGH event arrives
    const highEvent = buildRealEvent({ id: 'evt_high_new', canonicalEventId: 'evt_high_new' });
    const snap1 = await repo.loadSnapshot(portfolioId);
    const s1 = applyPortfolioNewsState({
      portfolioId,
      events: [seedEvent, highEvent],
      persistedStates: snap1.eventStates,
      syncState: snap1.syncState,
      referenceDate: new Date('2026-11-11T10:00:00.000Z'),
    });
    await repo.persistSnapshot({
      portfolioId,
      syncState: s1.syncStateToPersist,
      items: s1.statesToUpsert,
    });

    const { eligibleCandidates } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: s1.events,
      persistedStates: s1.statesToUpsert,
    });
    expect(eligibleCandidates).toHaveLength(1);

    const notifier = new FakeNewsAlertNotifier();
    const delivery1 = await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
      ports: {
        claimPendingAlerts: async (input) => {
          const r = await repo.claimPendingNewsAlerts({
            ...input,
            claimedAt: '2026-11-11T10:00:05.000Z',
          });
          return r.claimed;
        },
        confirmAlertsDelivered: async (input) => {
          await repo.confirmNewsAlertsDelivered({
            ...input,
            deliveredAt: '2026-11-11T10:00:06.000Z',
          });
        },
        releaseAlertsClaim: async (input) => {
          await repo.releaseNewsAlertsClaim(input);
        },
      },
    });
    expect(delivery1.status).toBe('DELIVERED');
    expect(delivery1.deliveredCount).toBe(1);

    // Simulate full application restart with a fresh PrismaClient
    const freshPrisma = new PrismaClient({
      datasources: {
        db: {
          url: TEST_DATABASE_URL,
        },
      },
    });
    await freshPrisma.$connect();
    const freshRepo = new PortfolioNewsStateRepository(freshPrisma);

    try {
      const snapAfterRestart = await freshRepo.loadSnapshot(portfolioId);
      const sAfterRestart = applyPortfolioNewsState({
        portfolioId,
        events: [seedEvent, highEvent],
        persistedStates: snapAfterRestart.eventStates,
        syncState: snapAfterRestart.syncState,
        referenceDate: new Date('2026-11-11T12:00:00.000Z'),
      });
      await freshRepo.persistSnapshot({
        portfolioId,
        syncState: sAfterRestart.syncStateToPersist,
        items: sAfterRestart.statesToUpsert,
      });

      const eligibleAfterRestart = selectAlertEligibleNewsEvents({
        portfolioId,
        events: sAfterRestart.events,
        persistedStates: sAfterRestart.statesToUpsert,
      });
      expect(eligibleAfterRestart.eligibleCandidates).toHaveLength(0);
      expect(eligibleAfterRestart.diagnostics.suppressedAlreadyDelivered).toBe(1);

      // Material update changes fingerprint -> alerts once again
      const updatedCritical = buildRealEvent({
        id: 'evt_high_new',
        canonicalEventId: 'evt_high_new',
        headline: 'PETROBRAS (PETR4): Fato Relevante Retificado — Valor elevado',
        materiality: 'CRITICAL',
        materialityReason: 'Elevação crítica no valor do provento retificado',
      });
      const snapBeforeUpdate = await freshRepo.loadSnapshot(portfolioId);
      const sUpdate = applyPortfolioNewsState({
        portfolioId,
        events: [seedEvent, updatedCritical],
        persistedStates: snapBeforeUpdate.eventStates,
        syncState: snapBeforeUpdate.syncState,
        referenceDate: new Date('2026-11-11T14:00:00.000Z'),
      });
      await freshRepo.persistSnapshot({
        portfolioId,
        syncState: sUpdate.syncStateToPersist,
        items: sUpdate.statesToUpsert,
      });

      const eligibleOnUpdate = selectAlertEligibleNewsEvents({
        portfolioId,
        events: sUpdate.events,
        persistedStates: sUpdate.statesToUpsert,
      });
      expect(eligibleOnUpdate.eligibleCandidates).toHaveLength(1);
      expect(eligibleOnUpdate.eligibleCandidates[0]!.state).toBe('UPDATED');
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('2. Concurrent claimPendingNewsAlerts calls allow strictly 1 claimer and release allows future retry on delivery failure', async () => {
    const { portfolioId } = await seedUserAndPortfolio('concurrency');

    const evt = buildRealEvent({
      id: 'evt_conc_1',
      canonicalEventId: 'evt_conc_1',
      headline: 'VALE (VALE3): Fato Relevante — Revisão de Investimentos',
      summary: 'Novo programa aprovado pelo conselho de administração.',
      assets: ['VALE3'],
      primaryTickers: ['VALE3'],
    });
    // Seed baseline first
    const base = applyPortfolioNewsState({
      portfolioId,
      events: [buildRealEvent({ id: 'evt_base_conc', canonicalEventId: 'evt_base_conc' })],
      persistedStates: [],
      syncState: null,
      referenceDate: new Date('2026-11-10T10:00:00.000Z'),
    });
    await repo.persistSnapshot({ portfolioId, syncState: base.syncStateToPersist, items: base.statesToUpsert });

    const snap = await repo.loadSnapshot(portfolioId);
    const s1 = applyPortfolioNewsState({
      portfolioId,
      events: [evt],
      persistedStates: snap.eventStates,
      syncState: snap.syncState,
      referenceDate: new Date('2026-11-11T10:00:00.000Z'),
    });
    await repo.persistSnapshot({ portfolioId, syncState: s1.syncStateToPersist, items: s1.statesToUpsert });

    const fp = s1.events[0]!.eventVersionFingerprint!;
    const candidates = [{ canonicalEventId: 'evt_conc_1', eventVersionFingerprint: fp }];

    // Simultaneous claims race under advisory lock -> strictly 1 caller wins the claim
    const [claimA, claimB, claimC] = await Promise.all([
      repo.claimPendingNewsAlerts({ portfolioId, candidates, claimedAt: '2026-11-11T10:00:01.000Z' }),
      repo.claimPendingNewsAlerts({ portfolioId, candidates, claimedAt: '2026-11-11T10:00:01.000Z' }),
      repo.claimPendingNewsAlerts({ portfolioId, candidates, claimedAt: '2026-11-11T10:00:01.000Z' }),
    ]);

    const totalClaimed = claimA.claimed.length + claimB.claimed.length + claimC.claimed.length;
    expect(totalClaimed).toBe(1);

    // Failed OS delivery releases claim without marking delivered -> next claim succeeds
    await repo.releaseNewsAlertsClaim({ portfolioId, items: candidates });
    const snapAfterFail = await repo.loadSnapshot(portfolioId);
    const rowAfterFail = snapAfterFail.eventStates.find((r) => r.canonicalEventId === 'evt_conc_1');
    expect(rowAfterFail?.meta.alertedVersionFingerprint).toBeNull();

    const retryClaim = await repo.claimPendingNewsAlerts({
      portfolioId,
      candidates,
      claimedAt: '2026-11-11T10:01:00.000Z',
    });
    expect(retryClaim.claimed).toHaveLength(1);
  });

  it('3. Pre-16N existing NEW rows are baseline-suppressed on rollout and portfolios remain strictly isolated', async () => {
    const pA = await seedUserAndPortfolio('port-A');
    const pB = await seedUserAndPortfolio('port-B');

    const evt = buildRealEvent({ id: 'evt_rollout_shared', canonicalEventId: 'evt_rollout_shared' });

    // Insert pre-16N sync + NEW row directly without any APP-16N alert metadata
    await prisma.portfolioNewsSyncState.create({
      data: {
        portfolioId: pA.portfolioId,
        newsStateInitializedAt: new Date('2026-11-09T00:00:00.000Z'),
        lastRefreshedAt: new Date('2026-11-10T00:00:00.000Z'),
      },
    });
    const probe = applyPortfolioNewsState({
      portfolioId: pA.portfolioId,
      events: [evt],
      persistedStates: [],
      syncState: null,
      referenceDate: new Date('2026-11-10T00:00:00.000Z'),
    });
    const fp = probe.events[0]!.eventVersionFingerprint!;
    await prisma.portfolioNewsEventStateRecord.create({
      data: {
        portfolioId: pA.portfolioId,
        canonicalEventId: 'evt_rollout_shared',
        firstSeenAt: new Date('2026-11-10T00:00:00.000Z'),
        lastObservedAt: new Date('2026-11-10T00:00:00.000Z'),
        firstFingerprint: fp,
        latestFingerprint: fp,
        state: 'NEW',
        latestUpdateReasons: [],
        eventPublishedAt: new Date(evt.publishedAt),
        snapshotMeta: { official: true, materiality: 'HIGH', tickers: ['PETR4'] },
      },
    });

    const snapA = await repo.loadSnapshot(pA.portfolioId);
    const rolloutA = applyPortfolioNewsState({
      portfolioId: pA.portfolioId,
      events: [evt],
      persistedStates: snapA.eventStates,
      syncState: snapA.syncState,
      referenceDate: new Date('2026-11-11T10:00:00.000Z'),
    });
    await repo.persistSnapshot({
      portfolioId: pA.portfolioId,
      syncState: rolloutA.syncStateToPersist,
      items: rolloutA.statesToUpsert,
    });

    // Event remains NEW in Inbox for Portfolio A, but 0 retroactive alerts eligible
    expect(rolloutA.events[0]!.state).toBe('NEW');
    const selA = selectAlertEligibleNewsEvents({
      portfolioId: pA.portfolioId,
      events: rolloutA.events,
      persistedStates: rolloutA.statesToUpsert,
    });
    expect(selA.eligibleCandidates).toHaveLength(0);

    // Portfolio B initialized separately: confirming/suppressing on A never affects B
    const snapB = await repo.loadSnapshot(pB.portfolioId);
    expect(snapB.eventStates).toHaveLength(0);
  });
});
