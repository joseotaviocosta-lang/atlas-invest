import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
  TEST_DATABASE_URL,
} from './setup';
import { PortfolioNewsStateRepository } from '../../packages/database/src';

describe('Database Integration: APP-16M Portfolio News State Persistence', () => {
  const prisma = getTestPrismaClient();
  const repo = new PortfolioNewsStateRepository(prisma);

  let portfolioAId: string;
  let portfolioBId: string;
  let userId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioAId = fixtures.portfolioId;
    userId = fixtures.userId;

    const secondPortfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Carteira B Isolamento',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    portfolioBId = secondPortfolio.id;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('1. Persists baseline, NEW, UPDATED, SEEN across full PrismaClient restart', async () => {
    const t0 = '2026-11-11T10:00:00.000Z';
    const t1 = '2026-11-11T11:00:00.000Z';
    const t2 = '2026-11-11T12:00:00.000Z';

    await repo.persistSnapshot({
      portfolioId: portfolioAId,
      syncState: {
        portfolioId: portfolioAId,
        newsStateInitializedAt: t0,
        lastRefreshedAt: t0,
      },
      items: [
        {
          portfolioId: portfolioAId,
          canonicalEventId: 'evt_hist_1',
          firstSeenAt: t0,
          lastObservedAt: t0,
          lastSeenByUserAt: null,
          firstFingerprint: 'fp_hist_1',
          latestFingerprint: 'fp_hist_1',
          state: 'UNCHANGED',
          latestUpdateReasons: [],
          eventPublishedAt: t0,
          meta: { official: false, materiality: 'MEDIUM' },
        },
        {
          portfolioId: portfolioAId,
          canonicalEventId: 'evt_new_1',
          firstSeenAt: t1,
          lastObservedAt: t1,
          lastSeenByUserAt: null,
          firstFingerprint: 'fp_new_1',
          latestFingerprint: 'fp_new_1',
          state: 'NEW',
          latestUpdateReasons: [],
          eventPublishedAt: t1,
          meta: { official: false, materiality: 'HIGH' },
        },
      ],
    });

    const markRes = await repo.markSeen({
      portfolioId: portfolioAId,
      canonicalEventIds: ['evt_new_1'],
      seenAt: t2,
    });
    expect(markRes.updatedCount).toBe(1);

    // Simulate process/app restart with a brand new PrismaClient instance
    const restartedPrisma = new PrismaClient({
      datasources: {
        db: { url: TEST_DATABASE_URL },
      },
    });
    const restartedRepo = new PortfolioNewsStateRepository(restartedPrisma);

    try {
      const snap = await restartedRepo.loadSnapshot(portfolioAId);
      expect(snap.syncState?.newsStateInitializedAt).toBe(t0);
      expect(snap.eventStates).toHaveLength(2);
      const seenRow = snap.eventStates.find((r) => r.canonicalEventId === 'evt_new_1');
      expect(seenRow?.state).toBe('SEEN');
      expect(seenRow?.lastSeenByUserAt).toBe(t2);

      // Portfolio B remains completely empty / isolated
      const snapB = await restartedRepo.loadSnapshot(portfolioBId);
      expect(snapB.syncState).toBeNull();
      expect(snapB.eventStates).toHaveLength(0);
    } finally {
      await restartedPrisma.$disconnect();
    }
  });

  it('2. Concurrent persistSnapshot calls remain idempotent with zero duplicate key violations', async () => {
    const t0 = '2026-11-11T10:00:00.000Z';
    const items = Array.from({ length: 25 }, (_, i) => ({
      portfolioId: portfolioAId,
      canonicalEventId: `evt_conc_${i}`,
      firstSeenAt: t0,
      lastObservedAt: t0,
      lastSeenByUserAt: null,
      firstFingerprint: `fp_${i}`,
      latestFingerprint: `fp_${i}`,
      state: 'UNCHANGED' as const,
      latestUpdateReasons: [],
      eventPublishedAt: t0,
      meta: { materiality: 'MEDIUM' },
    }));

    await Promise.all([
      repo.persistSnapshot({
        portfolioId: portfolioAId,
        syncState: { portfolioId: portfolioAId, newsStateInitializedAt: t0, lastRefreshedAt: t0 },
        items,
      }),
      repo.persistSnapshot({
        portfolioId: portfolioAId,
        syncState: { portfolioId: portfolioAId, newsStateInitializedAt: t0, lastRefreshedAt: t0 },
        items,
      }),
    ]);

    const snap = await repo.loadSnapshot(portfolioAId);
    expect(snap.eventStates).toHaveLength(25);
  });

  it('3. Consolidates Media-Only -> Official-Only promotion in PostgreSQL keeping exact 1 row across restarts', async () => {
    const t0 = '2026-11-11T10:00:00.000Z';
    const t1 = '2026-11-11T13:00:00.000Z';
    const t2 = '2026-11-11T14:00:00.000Z';

    // Step 1: Initial baseline media-only event persisted
    await repo.persistSnapshot({
      portfolioId: portfolioAId,
      syncState: {
        portfolioId: portfolioAId,
        newsStateInitializedAt: t0,
        lastRefreshedAt: t0,
      },
      items: [
        {
          portfolioId: portfolioAId,
          canonicalEventId: 'evt_media_petr4_div',
          firstSeenAt: t0,
          lastObservedAt: t0,
          lastSeenByUserAt: null,
          firstFingerprint: 'fp_media_1',
          latestFingerprint: 'fp_media_1',
          state: 'UNCHANGED',
          latestUpdateReasons: [],
          eventPublishedAt: '2026-11-11T09:30:00.000Z',
          meta: {
            ticker: 'PETR4',
            headline: 'Petrobras aprova dividendos de R$ 2 bilhões',
            eventType: 'DIVIDEND',
            materiality: 'HIGH',
            official: false,
            sources: ['InfoMoney'],
            sourceUrls: ['https://www.infomoney.com.br/mercados/petrobras-aprova-dividendos/'],
          },
        },
      ],
    });

    // Step 2: Concurrent refreshes promote media-only -> official-only via previousCanonicalEventId
    await Promise.all([
      repo.persistSnapshot({
        portfolioId: portfolioAId,
        syncState: {
          portfolioId: portfolioAId,
          newsStateInitializedAt: t0,
          lastRefreshedAt: t1,
        },
        items: [
          {
            portfolioId: portfolioAId,
            canonicalEventId: 'evt_cvm_petr4_div',
            previousCanonicalEventId: 'evt_media_petr4_div',
            firstSeenAt: t0,
            lastObservedAt: t1,
            lastSeenByUserAt: null,
            firstFingerprint: 'fp_media_1',
            latestFingerprint: 'fp_cvm_2',
            state: 'UPDATED',
            latestUpdateReasons: ['OFFICIAL_SOURCE_ADDED'],
            eventPublishedAt: '2026-11-11T12:30:00.000Z',
            meta: {
              ticker: 'PETR4',
              headline: 'Fato Relevante - Aprovação de Dividendos de R$ 2 bilhões',
              eventType: 'DIVIDEND',
              materiality: 'HIGH',
              official: true,
              sources: ['CVM Fatos Relevantes'],
              sourceUrls: ['https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=999111'],
            },
          },
        ],
      }),
      repo.persistSnapshot({
        portfolioId: portfolioAId,
        syncState: {
          portfolioId: portfolioAId,
          newsStateInitializedAt: t0,
          lastRefreshedAt: t1,
        },
        items: [
          {
            portfolioId: portfolioAId,
            canonicalEventId: 'evt_cvm_petr4_div',
            previousCanonicalEventId: 'evt_media_petr4_div',
            firstSeenAt: t0,
            lastObservedAt: t1,
            lastSeenByUserAt: null,
            firstFingerprint: 'fp_media_1',
            latestFingerprint: 'fp_cvm_2',
            state: 'UPDATED',
            latestUpdateReasons: ['OFFICIAL_SOURCE_ADDED'],
            eventPublishedAt: '2026-11-11T12:30:00.000Z',
            meta: {
              ticker: 'PETR4',
              headline: 'Fato Relevante - Aprovação de Dividendos de R$ 2 bilhões',
              eventType: 'DIVIDEND',
              materiality: 'HIGH',
              official: true,
              sources: ['CVM Fatos Relevantes'],
              sourceUrls: ['https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=999111'],
            },
          },
        ],
      }),
    ]);

    const afterPromo = await repo.loadSnapshot(portfolioAId);
    expect(afterPromo.eventStates).toHaveLength(1);
    expect(afterPromo.eventStates[0]).toMatchObject({
      canonicalEventId: 'evt_cvm_petr4_div',
      state: 'UPDATED',
      latestUpdateReasons: ['OFFICIAL_SOURCE_ADDED'],
    });

    // Step 3: User marks consolidated official event as SEEN and restarts PrismaClient
    const marked = await repo.markSeen({
      portfolioId: portfolioAId,
      canonicalEventIds: ['evt_cvm_petr4_div'],
      seenAt: t2,
    });
    expect(marked.updatedCount).toBe(1);

    const restartedPrisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    const restartedRepo = new PortfolioNewsStateRepository(restartedPrisma);
    try {
      const snapAfterRestart = await restartedRepo.loadSnapshot(portfolioAId);
      expect(snapAfterRestart.eventStates).toHaveLength(1);
      expect(snapAfterRestart.eventStates[0].state).toBe('SEEN');
      expect(snapAfterRestart.eventStates[0].lastSeenByUserAt).toBe(t2);
      expect(snapAfterRestart.eventStates[0].meta.official).toBe(true);
    } finally {
      await restartedPrisma.$disconnect();
    }
  });
});
