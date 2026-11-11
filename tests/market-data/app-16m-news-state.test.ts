import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  OPPORTUNITY_MODEL_VERSION,
  OpportunityRadarEngine,
  canonicalizeNewsEvents,
  buildDailyNewsDigest,
  classifyNewsMateriality,
  computeEventVersionFingerprint,
  normalizeNewsSourceUrl,
  applyPortfolioNewsState,
  computeMarkEventsSeenTransitions,
  compareEventsByMaterialityAndNovelty,
  type PortfolioNewsEvent,
  type PersistedPortfolioNewsEventState,
  type PersistedPortfolioNewsSyncState,
  type RawNewsInput,
} from '@atlas/market-data';
import type {
  IPortfolioNewsStateRepository,
  PersistedPortfolioNewsEventStateRow,
  PersistedPortfolioNewsSyncStateRow,
  UpsertPortfolioNewsEventStateInput,
} from '@atlas/database';
import { GetOpportunityRadarUseCase } from '../../apps/api/src/application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { PortfolioOpportunityRadarController } from '../../apps/api/src/modules/portfolios/portfolio-opportunity-radar.controller';
import { OpportunityRadarCacheService } from '../../apps/api/src/application/portfolios/opportunity-radar/opportunity-radar-cache.service';

function makeEvent(overrides: Partial<PortfolioNewsEvent> & { id: string; ticker?: string }): PortfolioNewsEvent {
  const ticker = overrides.ticker || 'PETR4';
  return {
    id: overrides.id,
    canonicalEventId: overrides.canonicalEventId || overrides.id,
    headline: overrides.headline || `Comunicado relevante ${ticker} (${overrides.id})`,
    summary: overrides.summary || `Detalhes do evento ${overrides.id} para ${ticker}`,
    publishedAt: overrides.publishedAt || '2026-11-11T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-11-11T12:00:00.000Z',
    importance: overrides.importance ?? 3,
    sentiment: overrides.sentiment ?? 'NEUTRAL',
    sentimentScore: overrides.sentimentScore ?? 0,
    sentimentMethod: overrides.sentimentMethod ?? 'LEXICAL_RULE',
    eventType: overrides.eventType ?? 'MARKET_NOTICE',
    assets: overrides.assets ?? [ticker],
    primaryTickers: overrides.primaryTickers ?? [ticker],
    secondaryTickers: overrides.secondaryTickers ?? [],
    sources: overrides.sources ?? [
      {
        name: 'InfoMoney',
        url: `https://www.infomoney.com.br/mercados/${overrides.id}`,
        publishedAt: '2026-11-11T10:00:00.000Z',
      },
    ],
    provider: overrides.provider ?? 'GOOGLE_NEWS',
    sourceType: overrides.sourceType ?? 'TRUSTED_FINANCIAL_MEDIA',
    official: overrides.official ?? false,
    freshness: overrides.freshness ?? 'BREAKING',
    decayWeight: overrides.decayWeight ?? 1.0,
    materiality: overrides.materiality ?? 'MEDIUM',
    materialityScore: overrides.materialityScore ?? 55,
    materialityReason: overrides.materialityReason ?? 'Aviso ordinário ou movimentação de mercado',
    state: overrides.state,
    isNew: overrides.isNew,
    isUpdated: overrides.isUpdated,
    isSeen: overrides.isSeen,
    updateReasons: overrides.updateReasons,
  };
}

class InMemoryPortfolioNewsStateRepo implements IPortfolioNewsStateRepository {
  private syncStates = new Map<string, PersistedPortfolioNewsSyncStateRow>();
  private eventStates = new Map<string, Map<string, PersistedPortfolioNewsEventStateRow>>();
  public loadCalls = 0;
  public persistCalls = 0;

  async loadSnapshot(portfolioId: string) {
    this.loadCalls++;
    const syncState = this.syncStates.get(portfolioId) ?? null;
    const rows = Array.from(this.eventStates.get(portfolioId)?.values() ?? []);
    return {
      syncState: syncState ? { ...syncState } : null,
      eventStates: rows.map((r) => ({ ...r, latestUpdateReasons: [...r.latestUpdateReasons], meta: { ...r.meta } })),
    };
  }

  async persistSnapshot(input: {
    portfolioId: string;
    syncState: PersistedPortfolioNewsSyncStateRow;
    items: UpsertPortfolioNewsEventStateInput[];
  }) {
    this.persistCalls++;
    const existingSync = this.syncStates.get(input.portfolioId);
    this.syncStates.set(input.portfolioId, {
      portfolioId: input.portfolioId,
      newsStateInitializedAt:
        existingSync?.newsStateInitializedAt ?? input.syncState.newsStateInitializedAt,
      lastRefreshedAt: input.syncState.lastRefreshedAt,
    });

    if (!this.eventStates.has(input.portfolioId)) {
      this.eventStates.set(input.portfolioId, new Map());
    }
    const portfolioMap = this.eventStates.get(input.portfolioId)!;

    for (const item of input.items) {
      if (item.previousCanonicalEventId && item.previousCanonicalEventId !== item.canonicalEventId) {
        portfolioMap.delete(item.previousCanonicalEventId);
      }
      portfolioMap.set(item.canonicalEventId, {
        id: `row_${item.canonicalEventId}`,
        portfolioId: item.portfolioId,
        canonicalEventId: item.canonicalEventId,
        firstSeenAt: item.firstSeenAt,
        lastObservedAt: item.lastObservedAt,
        lastSeenByUserAt: item.lastSeenByUserAt,
        firstFingerprint: item.firstFingerprint,
        latestFingerprint: item.latestFingerprint,
        state: item.state,
        latestUpdateReasons: [...item.latestUpdateReasons],
        eventPublishedAt: item.eventPublishedAt,
        meta: { ...item.meta },
      });
    }
  }

  async markSeen(input: {
    portfolioId: string;
    canonicalEventIds?: string[];
    markAllNovel?: boolean;
    seenAt: string;
  }) {
    const portfolioMap = this.eventStates.get(input.portfolioId);
    if (!portfolioMap) return { updatedCount: 0, updatedIds: [] };

    const updatedIds: string[] = [];
    for (const [id, row] of portfolioMap.entries()) {
      const targeted =
        (input.canonicalEventIds && input.canonicalEventIds.includes(id)) ||
        (input.markAllNovel && (row.state === 'NEW' || row.state === 'UPDATED'));
      if (targeted) {
        row.state = 'SEEN';
        row.lastSeenByUserAt = input.seenAt;
        row.latestUpdateReasons = [];
        updatedIds.push(id);
      }
    }
    return { updatedCount: updatedIds.length, updatedIds };
  }
}

describe('PROJECT ATLAS — APP-16M: New Event Detection & Portfolio News State', () => {
  const portfolioA = '00000000-0000-4000-8000-000000000002';
  const portfolioB = '00000000-0000-4000-8000-000000000003';
  const userA = '00000000-0000-4000-8000-000000000001';
  const userB = '00000000-0000-4000-8000-000000000099';

  const t0 = new Date('2026-11-11T10:00:00.000Z');
  const t1 = new Date('2026-11-11T11:00:00.000Z');
  const t2 = new Date('2026-11-11T12:00:00.000Z');
  const t3 = new Date('2026-11-11T13:00:00.000Z');

  it('1. Baseline initial with 393 historical events sets newsStateInitializedAt and marks all UNCHANGED with newCount=0', () => {
    const baselineEvents = Array.from({ length: 393 }, (_, i) =>
      makeEvent({
        id: `evt_hist_${i}`,
        ticker: i % 2 === 0 ? 'PETR4' : 'VALE3',
        materiality: i < 53 ? 'HIGH' : i < 339 ? 'MEDIUM' : 'ROUTINE',
      }),
    );

    const res = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: baselineEvents,
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    expect(res.syncStateToPersist.newsStateInitializedAt).toBe(t0.toISOString());
    expect(res.summary.initialized).toBe(true);
    expect(res.summary.newEventsCount).toBe(0);
    expect(res.summary.newMaterialEventsCount).toBe(0);
    expect(res.summary.updatedEventsCount).toBe(0);
    expect(res.events.every((e) => e.state === 'UNCHANGED' && e.isNew === false)).toBe(true);
  });

  it('2. Second identical execution preserves stability without generating false NEW or UPDATED', () => {
    const eventsRun1 = [
      makeEvent({ id: 'evt_1', ticker: 'PETR4', updatedAt: '2026-11-11T10:00:00.000Z' }),
      makeEvent({ id: 'evt_2', ticker: 'VALE3', materiality: 'HIGH', updatedAt: '2026-11-11T10:00:00.000Z' }),
    ];

    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: eventsRun1,
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const eventsRun2 = [
      makeEvent({ id: 'evt_1', ticker: 'PETR4', updatedAt: '2026-11-11T11:30:00.000Z' }),
      makeEvent({ id: 'evt_2', ticker: 'VALE3', materiality: 'HIGH', updatedAt: '2026-11-11T11:30:00.000Z' }),
    ];

    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: eventsRun2,
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.newEventsCount).toBe(0);
    expect(r2.summary.updatedEventsCount).toBe(0);
    expect(r2.events.every((e) => e.state === 'UNCHANGED')).toBe(true);
  });

  it('3. 1 genuine new event after baseline becomes NEW and newEventsCount = 1', () => {
    const e1 = makeEvent({ id: 'evt_base_1', ticker: 'WEGE3' });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [e1],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const eNew = makeEvent({ id: 'evt_brand_new', ticker: 'BBAS3', materiality: 'HIGH' });
    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [e1, eNew],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.newEventsCount).toBe(1);
    expect(r2.summary.newMaterialEventsCount).toBe(1);
    const detected = r2.events.find((e) => e.canonicalEventId === 'evt_brand_new');
    expect(detected?.state).toBe('NEW');
    expect(detected?.isNew).toBe(true);
  });

  it('4. N new events across materiality levels produce exact newEventsCount and newMaterialEventsCount', () => {
    const base = makeEvent({ id: 'evt_base' });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const n1 = makeEvent({ id: 'evt_n1', materiality: 'CRITICAL' });
    const n2 = makeEvent({ id: 'evt_n2', materiality: 'HIGH' });
    const n3 = makeEvent({ id: 'evt_n3', materiality: 'LOW' });
    const n4 = makeEvent({ id: 'evt_n4', materiality: 'ROUTINE' });

    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base, n1, n2, n3, n4],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.newEventsCount).toBe(4);
    expect(r2.summary.newMaterialEventsCount).toBe(2); // CRITICAL + HIGH only
  });

  it('5. Official promotion (Media -> CVM/B3) transitions to UPDATED with OFFICIAL_SOURCE_ADDED and zero duplicate NEW', () => {
    const mediaRaw: RawNewsInput = {
      id: 'rss_petr_1',
      ticker: 'PETR4',
      headline: 'Petrobras aprova pagamento de dividendos bilionários - InfoMoney',
      summary: 'Conselho aprova distribuição de R$ 15 bilhões em proventos.',
      publishedAt: '2026-11-11T12:00:00.000Z',
      url: 'https://www.infomoney.com.br/petrobras-dividendos?utm_source=rss',
      sourceName: 'InfoMoney',
      provider: 'GOOGLE_NEWS',
      sourceType: 'TRUSTED_FINANCIAL_MEDIA',
      official: false,
    };

    const cvmRaw: RawNewsInput = {
      id: 'cvm_998877',
      ticker: 'PETR4',
      headline: 'PETROBRAS (PETR4): Fato Relevante — Aprovação de pagamento de dividendos',
      summary: 'Comunicado oficial CVM sobre aprovação de distribuição de dividendos.',
      publishedAt: '2026-11-11T12:30:00.000Z',
      url: 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=998877',
      sourceName: 'CVM',
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
    };

    const canonicalRun1 = canonicalizeNewsEvents([mediaRaw], t0);
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: canonicalRun1,
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    // Later refresh: both media and CVM present (even in reversed order!)
    const canonicalRun2 = canonicalizeNewsEvents([cvmRaw, mediaRaw], t1);
    expect(canonicalRun2.length).toBe(1);
    expect(canonicalRun2[0]!.canonicalEventId).toBe(canonicalRun1[0]!.canonicalEventId);

    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: canonicalRun2,
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.newEventsCount).toBe(0);
    expect(r2.summary.updatedEventsCount).toBe(1);
    expect(r2.events[0]!.state).toBe('UPDATED');
    expect(r2.events[0]!.isUpdated).toBe(true);
    expect(r2.events[0]!.updateReasons).toContain('OFFICIAL_SOURCE_ADDED');
  });

  it('5b. Official promotion still links to UPDATED even if CVM arrives with earlier midnight timestamp and shifts cluster ID', () => {
    const mediaEvent = makeEvent({
      id: 'evt_media_only',
      ticker: 'VALE3',
      official: false,
      sources: [{ name: 'InfoMoney', url: 'https://www.infomoney.com.br/vale-dividendo' }],
    });

    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [mediaEvent],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const promotedEvent = makeEvent({
      id: 'evt_cvm_shifted_id',
      ticker: 'VALE3',
      official: true,
      sourceType: 'OFFICIAL_REGULATORY',
      sources: [
        { name: 'InfoMoney', url: 'https://www.infomoney.com.br/vale-dividendo?utm_source=rss' },
        { name: 'CVM', url: 'https://rad.cvm.gov.br/ENET/doc.aspx?NumeroProtocoloEntrega=555' },
      ],
    });

    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [promotedEvent],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.newEventsCount).toBe(0);
    expect(r2.summary.updatedEventsCount).toBe(1);
    expect(r2.events[0]!.updateReasons).toContain('OFFICIAL_SOURCE_ADDED');
    expect(r2.statesToUpsert[0]!.previousCanonicalEventId).toBe('evt_media_only');
  });

  it('6. Duplicate non-official source echo without new info produces identical fingerprint and does NOT trigger UPDATED', () => {
    const ev1 = makeEvent({
      id: 'evt_dup',
      headline: 'B3 registra recorde de volume financeiro em novembro',
      sources: [{ name: 'InfoMoney', url: 'https://www.infomoney.com.br/b3-volume' }],
    });

    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [ev1],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const ev1WithMirror = makeEvent({
      id: 'evt_dup',
      headline: 'B3 registra recorde de volume financeiro em novembro',
      sources: [
        { name: 'Valor Econômico', url: 'https://valor.globo.com/financas/b3-volume?utm_source=rss' },
        { name: 'InfoMoney', url: 'https://www.infomoney.com.br/b3-volume' },
      ],
    });

    expect(computeEventVersionFingerprint(ev1WithMirror)).toBe(computeEventVersionFingerprint(ev1));

    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [ev1WithMirror],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.updatedEventsCount).toBe(0);
    expect(r2.events[0]!.state).toBe('UNCHANGED');
  });

  it('7. Materiality escalation (MEDIUM -> HIGH) transitions to UPDATED with MATERIALITY_CHANGED', () => {
    const base = makeEvent({ id: 'evt_mat', materiality: 'MEDIUM', materialityScore: 55 });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const escalated = makeEvent({ id: 'evt_mat', materiality: 'HIGH', materialityScore: 82 });
    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [escalated],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.updatedEventsCount).toBe(1);
    expect(r2.events[0]!.state).toBe('UPDATED');
    expect(r2.events[0]!.updateReasons).toContain('MATERIALITY_CHANGED');
  });

  it('8. Sentiment reversal (NEUTRAL -> NEGATIVE) transitions to UPDATED with SENTIMENT_CHANGED', () => {
    const base = makeEvent({ id: 'evt_sent', sentiment: 'NEUTRAL', sentimentScore: 0 });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const neg = makeEvent({ id: 'evt_sent', sentiment: 'NEGATIVE', sentimentScore: -0.8 });
    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [neg],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.summary.updatedEventsCount).toBe(1);
    expect(r2.events[0]!.state).toBe('UPDATED');
    expect(r2.events[0]!.updateReasons).toContain('SENTIMENT_CHANGED');
  });

  it('9. New official document version / CVM rectification -> UPDATED with NEW_DOCUMENT_VERSION', () => {
    const doc1 = makeEvent({
      id: 'evt_cvm_ver',
      official: true,
      sourceType: 'OFFICIAL_REGULATORY',
      sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/ENET/doc.aspx?NumeroProtocoloEntrega=100' }],
    });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [doc1],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const doc2 = makeEvent({
      id: 'evt_cvm_ver',
      official: true,
      sourceType: 'OFFICIAL_REGULATORY',
      sources: [
        { name: 'CVM', url: 'https://rad.cvm.gov.br/ENET/doc.aspx?NumeroProtocoloEntrega=100' },
        { name: 'CVM', url: 'https://rad.cvm.gov.br/ENET/doc.aspx?NumeroProtocoloEntrega=101' },
      ],
    });
    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [doc2],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    expect(r2.events[0]!.state).toBe('UPDATED');
    expect(r2.events[0]!.updateReasons).toContain('NEW_DOCUMENT_VERSION');
  });

  it('10 & 11. markSeen transitions NEW -> SEEN cleanly with timestamp; refresh without markSeen preserves NEW', () => {
    const base = makeEvent({ id: 'evt_b' });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const newEv = makeEvent({ id: 'evt_n', materiality: 'HIGH' });
    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base, newEv],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });
    expect(r2.summary.newEventsCount).toBe(1);

    // Refresh without markSeen -> stays NEW!
    const r2b = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base, newEv],
      persistedStates: r2.statesToUpsert,
      syncState: r2.syncStateToPersist,
      referenceDate: t2,
    });
    expect(r2b.events.find((e) => e.canonicalEventId === 'evt_n')?.state).toBe('NEW');
    expect(r2b.summary.newEventsCount).toBe(1);

    // User explicitly marks evt_n as seen
    const transitions = computeMarkEventsSeenTransitions({
      persistedStates: r2b.statesToUpsert,
      canonicalEventIds: ['evt_n'],
      referenceDate: t3,
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.state).toBe('SEEN');
    expect(transitions[0]!.lastSeenByUserAt).toBe(t3.toISOString());

    const afterSeenStates: PersistedPortfolioNewsEventState[] = r2b.statesToUpsert.map((s) =>
      s.canonicalEventId === 'evt_n' ? transitions[0]! : s,
    );

    const r3 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base, newEv],
      persistedStates: afterSeenStates,
      syncState: r2b.syncStateToPersist,
      referenceDate: new Date('2026-11-11T14:00:00.000Z'),
    });
    expect(r3.summary.newEventsCount).toBe(0);
    const seenEv = r3.events.find((e) => e.canonicalEventId === 'evt_n');
    expect(seenEv?.state).toBe('SEEN');
    expect(seenEv?.isSeen).toBe(true);
    expect(seenEv?.lastSeenByUserAt).toBe(t3.toISOString());
  });

  it('12. SEEN event receiving later material revision transitions SEEN -> UPDATED', () => {
    const base = makeEvent({ id: 'evt_b' });
    const r1 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });

    const newEv = makeEvent({ id: 'evt_rev', materiality: 'MEDIUM' });
    const r2 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base, newEv],
      persistedStates: r1.statesToUpsert,
      syncState: r1.syncStateToPersist,
      referenceDate: t1,
    });

    const seen = computeMarkEventsSeenTransitions({
      persistedStates: r2.statesToUpsert,
      canonicalEventIds: ['evt_rev'],
      referenceDate: t2,
    });
    const postSeen = r2.statesToUpsert.map((s) => (s.canonicalEventId === 'evt_rev' ? seen[0]! : s));

    const updatedEv = makeEvent({ id: 'evt_rev', materiality: 'CRITICAL' });
    const r3 = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [base, updatedEv],
      persistedStates: postSeen,
      syncState: r2.syncStateToPersist,
      referenceDate: t3,
    });

    const resultEv = r3.events.find((e) => e.canonicalEventId === 'evt_rev');
    expect(resultEv?.state).toBe('UPDATED');
    expect(resultEv?.updateReasons).toContain('MATERIALITY_CHANGED');
    expect(r3.summary.updatedEventsCount).toBe(1);
  });

  it('13. URL normalization removes tracking params while preserving regulatory identifiers', () => {
    const u1 = normalizeNewsSourceUrl(
      'https://www.InfoMoney.com.br/noticia/123/?utm_source=google&utm_medium=rss&fbclid=xyz#top',
    );
    const u2 = normalizeNewsSourceUrl('https://www.infomoney.com.br/noticia/123');
    expect(u1).toBe(u2);

    const cvm1 = normalizeNewsSourceUrl(
      'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=555&utm_source=x',
    );
    const cvm2 = normalizeNewsSourceUrl(
      'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?NumeroProtocoloEntrega=555',
    );
    expect(cvm1).toBe(cvm2);
    expect(cvm1).toContain('NumeroProtocoloEntrega=555');
  });

  it('14. Source array permutation does not change eventVersionFingerprint or canonicalEventId', () => {
    const a = makeEvent({
      id: 'evt_perm',
      official: true,
      sourceType: 'OFFICIAL_REGULATORY',
      sources: [
        { name: 'CVM', url: 'https://rad.cvm.gov.br/doc?NumeroProtocoloEntrega=1', publishedAt: '2026-11-11T10:00:00Z' },
        { name: 'InfoMoney', url: 'https://infomoney.com.br/a?utm_source=rss', publishedAt: '2026-11-11T11:00:00Z' },
      ],
    });
    const b = makeEvent({
      id: 'evt_perm',
      official: true,
      sourceType: 'OFFICIAL_REGULATORY',
      sources: [
        { name: 'InfoMoney', url: 'https://infomoney.com.br/a', publishedAt: '2026-11-11T12:00:00Z' },
        { name: 'CVM', url: 'https://rad.cvm.gov.br/doc?NumeroProtocoloEntrega=1', publishedAt: '2026-11-11T09:00:00Z' },
      ],
    });
    expect(computeEventVersionFingerprint(a)).toBe(computeEventVersionFingerprint(b));
  });

  it('15. Zero impact on News Score V2, Opportunity Score, materiality, sentiment, and modelVersion', () => {
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');

    const rawMat = classifyNewsMateriality({
      headline: 'PETR4 aprova aquisição estratégica de R$ 20 bi',
      eventType: 'FACT_RELEVANT',
      official: true,
    });
    expect(rawMat.level).toBe('HIGH');

    const scoreResult = OpportunityRadarEngine.evaluate({
      portfolioId: portfolioA,
      referenceDate: t0,
      assets: [
        {
          assetId: 'a1',
          ticker: 'PETR4',
          name: 'Petrobras',
          assetType: 'STOCK',
          currency: 'BRL',
          currentPrice: '38.00',
          dailyChangePercent: 1.2,
          portfolioWeight: 5.0,
          classWeight: 25.0,
          quantity: '100',
          marketValue: '3800.00',
          dividendYield: 12.0,
          priceEarnings: 5.0,
          priceToBook: 1.1,
          recentNews: [
            {
              id: 'n1',
              headline: 'Fato relevante',
              source: 'CVM',
              publishedAt: '2026-11-11T10:00:00Z',
              sentiment: 'POSITIVE',
              relevance: 1.0,
            },
          ],
        },
      ],
    });
    expect(scoreResult.modelVersion).toBe('opportunity-v2.3.1');

    const e = makeEvent({ id: 'evt_iso', materiality: 'HIGH', materialityScore: 80, sentiment: 'POSITIVE' });
    const r = applyPortfolioNewsState({
      portfolioId: portfolioA,
      events: [e],
      persistedStates: [],
      syncState: null,
      referenceDate: t0,
    });
    expect(r.events[0]!.materiality).toBe('HIGH');
    expect(r.events[0]!.materialityScore).toBe(80);
    expect(r.events[0]!.sentiment).toBe('POSITIVE');
  });

  it('16. Priority sorting enforces CRITICAL SEEN > LOW NEW while prioritizing NEW within same materiality tier', () => {
    const lowNew = makeEvent({ id: 'low_new', materiality: 'LOW', state: 'NEW' });
    const criticalSeen = makeEvent({ id: 'crit_seen', materiality: 'CRITICAL', state: 'SEEN' });
    const criticalNew = makeEvent({ id: 'crit_new', materiality: 'CRITICAL', state: 'NEW' });
    const highUpdated = makeEvent({ id: 'high_upd', materiality: 'HIGH', state: 'UPDATED' });
    const highSeen = makeEvent({ id: 'high_seen', materiality: 'HIGH', state: 'SEEN' });

    const sorted = [lowNew, highSeen, criticalSeen, highUpdated, criticalNew].sort(
      compareEventsByMaterialityAndNovelty,
    );
    expect(sorted.map((x) => x.id)).toEqual([
      'crit_new',
      'crit_seen',
      'high_upd',
      'high_seen',
      'low_new',
    ]);

    const digest = buildDailyNewsDigest(sorted, { referenceDate: t0, maxItems: 10 });
    expect(digest.items[0]!.canonicalEventId).toBe('crit_new');
    expect(digest.items[1]!.canonicalEventId).toBe('crit_seen');
    expect(digest.items[digest.items.length - 1]!.canonicalEventId).toBe('low_new');
    expect(digest.newEventsCount).toBe(2);
    expect(digest.newMaterialEventsCount).toBe(1); // Only crit_new is CRITICAL/HIGH
    expect(digest.updatedEventsCount).toBe(1);
    expect(digest.seenEventsCount).toBe(2);
  });

  describe('API UseCase & Controller Integration (Per-Portfolio Isolation, Concurrency, Ownership)', () => {
    let repo: InMemoryPortfolioNewsStateRepo;
    let mockNewsPipeline: any;
    let useCase: GetOpportunityRadarUseCase;
    let controller: PortfolioOpportunityRadarController;
    let currentEvents: PortfolioNewsEvent[];

    beforeEach(() => {
      repo = new InMemoryPortfolioNewsStateRepo();
      currentEvents = [
        makeEvent({ id: 'evt_shared_petr4', ticker: 'PETR4', materiality: 'HIGH' }),
      ];

      mockNewsPipeline = {
        getPortfolioNews: vi.fn().mockImplementation(async () => ({
          events: currentEvents,
          totalEvents: currentEvents.length,
          byAssetCount: { PETR4: currentEvents.length },
          digest: buildDailyNewsDigest(currentEvents, { referenceDate: t0, maxItems: 10 }),
          assetDailyStatus: { PETR4: 'MATERIAL_EVENT' },
          metrics: {
            breakingCount: currentEvents.length,
            recentCount: currentEvents.length,
            officialCount: 0,
            highImportanceCount: 1,
            materialCount: 1,
            criticalCount: 0,
            highCount: 1,
            mediumCount: 0,
            routineCount: 0,
            totalAuditedAssets: 1,
            assetsWithNews: 1,
            assetsWithoutNews: 0,
            officialCoverageCount: 1,
            providerStatus: {
              brapiNewsAvailable: false,
              brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
              officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
              cvmStatus: 'AVAILABLE',
              fnetStatus: 'AVAILABLE',
              fallbackActive: true,
              providersUsed: ['Google News RSS (Agregador)'],
            },
          },
          asOf: t0.toISOString(),
        })),
      };

      const mockPortfolioRepo = {
        findById: vi.fn().mockImplementation(async (id: string) => {
          if (id === portfolioA || id === portfolioB) {
            return { id, userId: userA, name: id === portfolioA ? 'Principal' : 'Reserva' };
          }
          return null;
        }),
      };

      const mockValuationUseCase = {
        execute: vi.fn().mockResolvedValue({
          positions: [
            {
              ticker: 'PETR4',
              status: 'VALUED',
              marketValue: { amount: '1000.00' },
            },
          ],
        }),
      };

      useCase = new GetOpportunityRadarUseCase(
        mockPortfolioRepo as any,
        {} as any,
        { list: vi.fn().mockResolvedValue({ items: [], hasMore: false }) } as any,
        mockValuationUseCase as any,
        { getActiveStrategy: vi.fn().mockResolvedValue(null) } as any,
        new OpportunityRadarCacheService(),
        { getToken: () => undefined } as any,
        mockNewsPipeline,
        repo,
      );
      controller = new PortfolioOpportunityRadarController(useCase);
    });

    it('17. Batch state lookup (zero N+1) and per-portfolio isolation (marking SEEN in A does not mark B)', async () => {
      // Baseline init for A and B
      await useCase.getPortfolioNews({ portfolioId: portfolioA, userId: userA, now: t0 });
      await useCase.getPortfolioNews({ portfolioId: portfolioB, userId: userA, now: t0 });

      // Add a new event visible to both portfolios
      currentEvents = [
        makeEvent({ id: 'evt_shared_petr4', ticker: 'PETR4', materiality: 'HIGH' }),
        makeEvent({ id: 'evt_shared_new', ticker: 'PETR4', materiality: 'CRITICAL' }),
      ];

      const resA1 = await useCase.getPortfolioNews({ portfolioId: portfolioA, userId: userA, now: t1 });
      const resB1 = await useCase.getPortfolioNews({ portfolioId: portfolioB, userId: userA, now: t1 });
      expect(resA1.newsState?.newEventsCount).toBe(1);
      expect(resB1.newsState?.newEventsCount).toBe(1);

      // Mark seen ONLY in portfolioA
      await controller.markPortfolioNewsSeen(
        portfolioA,
        { userId: userA, sessionId: 's1' } as any,
        { canonicalEventIds: ['evt_shared_new'] },
      );

      const resA2 = await useCase.getPortfolioNews({ portfolioId: portfolioA, userId: userA, now: t2 });
      const resB2 = await useCase.getPortfolioNews({ portfolioId: portfolioB, userId: userA, now: t2 });

      expect(resA2.newsState?.newEventsCount).toBe(0);
      expect(resA2.events.find((e) => e.canonicalEventId === 'evt_shared_new')?.state).toBe('SEEN');
      expect(resB2.newsState?.newEventsCount).toBe(1);
      expect(resB2.events.find((e) => e.canonicalEventId === 'evt_shared_new')?.state).toBe('NEW');
    });

    it('18. GET /news NEVER auto-marks NEW events as SEEN; concurrent refreshes serialize without duplicate/corrupt state', async () => {
      await controller.getPortfolioNews(portfolioA, { userId: userA, sessionId: 's1' } as any);

      currentEvents = [
        makeEvent({ id: 'evt_shared_petr4', ticker: 'PETR4', materiality: 'HIGH' }),
        makeEvent({ id: 'evt_concurrent_1', ticker: 'PETR4', materiality: 'HIGH' }),
      ];

      // Fire two concurrent refreshes simultaneously
      const [c1, c2] = await Promise.all([
        controller.refreshPortfolioNews(portfolioA, { userId: userA, sessionId: 's1' } as any),
        controller.refreshPortfolioNews(portfolioA, { userId: userA, sessionId: 's1' } as any),
      ]);

      expect(c1.data.newsState?.newEventsCount).toBe(1);
      expect(c2.data.newsState?.newEventsCount).toBe(1);

      // Repeated GET never clears NEW automatically
      const afterGet = await controller.getPortfolioNews(
        portfolioA,
        { userId: userA, sessionId: 's1' } as any,
      );
      expect(afterGet.data.newsState?.newEventsCount).toBe(1);
      expect(afterGet.data.events.find((e) => e.canonicalEventId === 'evt_concurrent_1')?.state).toBe('NEW');
    });

    it('19. Anti-enumeration 404 when another user attempts to read news or markPortfolioNewsSeen', async () => {
      await expect(
        controller.getPortfolioNews(portfolioA, { userId: userB, sessionId: 's2' } as any),
      ).rejects.toThrow(NotFoundException);

      await expect(
        controller.markPortfolioNewsSeen(
          portfolioA,
          { userId: userB, sessionId: 's2' } as any,
          { markAllNew: true },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('APP-16M-R1 Cross-Refresh Identity Continuity (Media-Only -> Official-Only Without URL Overlap)', () => {
    it('20. Baseline/UNCHANGED media-only -> Refresh 2 official-only without media URL transitions to UPDATED (NEW=0, UPDATED=1)', () => {
      const portfolioId = '11111111-1111-4111-8111-111111111111';
      const t0 = new Date('2026-11-11T10:00:00.000Z');
      const t1 = new Date('2026-11-11T14:00:00.000Z');

      const [mediaOnlyEvent] = canonicalizeNewsEvents(
        [
          {
            id: 'raw-infomoney-petr4-div',
            ticker: 'PETR4',
            headline: 'Petrobras aprova pagamento de dividendos de R$ 2 bilhões aos acionistas - InfoMoney',
            summary: 'Conselho de administração aprovou distribuição de proventos de R$ 2 bilhões referentes ao exercício.',
            url: 'https://www.infomoney.com.br/mercados/petrobras-aprova-dividendos-2-bilhoes/',
            sourceName: 'InfoMoney',
            publishedAt: '2026-11-11T09:30:00.000Z',
            provider: 'GOOGLE_NEWS',
            sourceType: 'TRUSTED_FINANCIAL_MEDIA',
            official: false,
          },
        ],
        t0,
      );

      expect(mediaOnlyEvent.official).toBe(false);

      // Refresh 1: Initial baseline
      const r1 = applyPortfolioNewsState({
        portfolioId,
        events: [mediaOnlyEvent],
        persistedStates: [],
        syncState: null,
        referenceDate: t0,
      });

      expect(r1.summary).toMatchObject({ newEventsCount: 0, updatedEventsCount: 0, seenEventsCount: 0 });
      expect(r1.events[0].state).toBe('UNCHANGED');

      // Refresh 2: CVM official-only event with completely different canonical ID and NO media URL
      const [officialOnlyEvent] = canonicalizeNewsEvents(
        [
          {
            id: 'cvm-ipe-petr4-div-20261111',
            ticker: 'PETR4',
            headline: 'Fato Relevante - Aprovação de Distribuição de Dividendos de R$ 2 bilhões',
            summary: 'A Petrobras comunica que seu Conselho de Administração aprovou a distribuição de dividendos de R$ 2 bilhões.',
            url: 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=999111',
            sourceName: 'CVM Fatos Relevantes',
            publishedAt: '2026-11-11T13:30:00.000Z',
            provider: 'CVM',
            sourceType: 'OFFICIAL_REGULATORY',
            official: true,
          },
        ],
        t1,
      );

      expect(officialOnlyEvent.official).toBe(true);
      expect(officialOnlyEvent.canonicalEventId).not.toBe(mediaOnlyEvent.canonicalEventId);

      const persistedR1: PersistedPortfolioNewsEventState[] = r1.statesToUpsert.map((item) => ({
        canonicalEventId: item.canonicalEventId,
        firstSeenAt: item.firstSeenAt,
        lastObservedAt: item.lastObservedAt,
        lastSeenByUserAt: item.lastSeenByUserAt,
        firstFingerprint: item.firstFingerprint,
        latestFingerprint: item.latestFingerprint,
        state: item.state,
        latestUpdateReasons: item.latestUpdateReasons,
        eventPublishedAt: item.eventPublishedAt,
        meta: item.meta,
      }));

      const r2 = applyPortfolioNewsState({
        portfolioId,
        events: [officialOnlyEvent],
        persistedStates: persistedR1,
        syncState: r1.syncStateToPersist,
        referenceDate: t1,
      });

      expect(r2.summary).toMatchObject({ newEventsCount: 0, updatedEventsCount: 1, seenEventsCount: 0 });
      expect(r2.events).toHaveLength(1);
      expect(r2.events[0].state).toBe('UPDATED');
      expect(r2.events[0].isNew).toBe(false);
      expect(r2.events[0].isUpdated).toBe(true);
      expect(r2.events[0].updateReasons).toContain('OFFICIAL_SOURCE_ADDED');
      expect(r2.statesToUpsert).toHaveLength(1);
      expect(r2.statesToUpsert[0].previousCanonicalEventId).toBe(mediaOnlyEvent.canonicalEventId);

      // Idempotency: Repeating Refresh 2 with identical official-only payload does NOT generate NEW or duplicate
      const persistedR2: PersistedPortfolioNewsEventState[] = r2.statesToUpsert.map((item) => ({
        canonicalEventId: item.canonicalEventId,
        firstSeenAt: item.firstSeenAt,
        lastObservedAt: item.lastObservedAt,
        lastSeenByUserAt: item.lastSeenByUserAt,
        firstFingerprint: item.firstFingerprint,
        latestFingerprint: item.latestFingerprint,
        state: item.state,
        latestUpdateReasons: item.latestUpdateReasons,
        eventPublishedAt: item.eventPublishedAt,
        meta: item.meta,
      }));

      const r3 = applyPortfolioNewsState({
        portfolioId,
        events: [officialOnlyEvent],
        persistedStates: persistedR2,
        syncState: r2.syncStateToPersist,
        referenceDate: new Date('2026-11-11T15:00:00.000Z'),
      });
      expect(r3.summary).toMatchObject({ newEventsCount: 0, updatedEventsCount: 1 });
      expect(r3.statesToUpsert[0].previousCanonicalEventId).toBeUndefined();
    });

    it('21. SEEN media-only -> official-only promotes to UPDATED; subsequent media-only fallback stays non-regressive without NEW', () => {
      const portfolioId = '11111111-1111-4111-8111-111111111111';
      const baseline = makeEvent({ id: 'baseline_evt', ticker: 'VALE3' });

      const r0 = applyPortfolioNewsState({
        portfolioId,
        events: [baseline],
        persistedStates: [],
        syncState: null,
        referenceDate: new Date('2026-11-11T08:00:00.000Z'),
      });

      const [mediaNew] = canonicalizeNewsEvents(
        [
          {
            id: 'raw-valor-hglg11-emissao',
            ticker: 'HGLG11',
            headline: 'HGLG11 anuncia nova emissão de cotas de R$ 500 milhões - Valor Econômico',
            summary: 'Fundo imobiliário HGLG11 protocolou nova oferta de emissão de cotas de R$ 500 milhões.',
            url: 'https://valor.globo.com/financas/noticia/hglg11-nova-emissao.ghtml',
            sourceName: 'Valor Econômico',
            publishedAt: '2026-11-11T10:00:00.000Z',
            provider: 'GOOGLE_NEWS',
            sourceType: 'TRUSTED_FINANCIAL_MEDIA',
            official: false,
          },
        ],
        new Date('2026-11-11T16:00:00.000Z'),
      );

      const persisted0 = r0.statesToUpsert.map((i) => ({
        canonicalEventId: i.canonicalEventId,
        firstSeenAt: i.firstSeenAt,
        lastObservedAt: i.lastObservedAt,
        lastSeenByUserAt: i.lastSeenByUserAt,
        firstFingerprint: i.firstFingerprint,
        latestFingerprint: i.latestFingerprint,
        state: i.state,
        latestUpdateReasons: i.latestUpdateReasons,
        eventPublishedAt: i.eventPublishedAt,
        meta: i.meta,
      }));

      // Media-only appears as NEW
      const r1 = applyPortfolioNewsState({
        portfolioId,
        events: [baseline, mediaNew],
        persistedStates: persisted0,
        syncState: r0.syncStateToPersist,
        referenceDate: new Date('2026-11-11T10:30:00.000Z'),
      });
      expect(r1.summary.newEventsCount).toBe(1);

      // User marks as SEEN
      const persisted1: PersistedPortfolioNewsEventState[] = r1.statesToUpsert.map((i) => ({
        canonicalEventId: i.canonicalEventId,
        firstSeenAt: i.firstSeenAt,
        lastObservedAt: i.lastObservedAt,
        lastSeenByUserAt: i.canonicalEventId === mediaNew.canonicalEventId ? '2026-11-11T11:00:00.000Z' : i.lastSeenByUserAt,
        firstFingerprint: i.firstFingerprint,
        latestFingerprint: i.latestFingerprint,
        state: i.canonicalEventId === mediaNew.canonicalEventId ? ('SEEN' as const) : i.state,
        latestUpdateReasons: i.canonicalEventId === mediaNew.canonicalEventId ? [] : i.latestUpdateReasons,
        eventPublishedAt: i.eventPublishedAt,
        meta: i.meta,
      }));

      // Official-only (FNET) appears later without Valor URL
      const [officialFnet] = canonicalizeNewsEvents(
        [
          {
            id: 'fnet-hglg11-emissao-8881',
            ticker: 'HGLG11',
            headline: 'Fato Relevante - HGLG11 aprova 10ª emissão de cotas de R$ 500 milhões',
            summary: 'Administrador do HGLG11 comunica aprovação de nova emissão de cotas no montante de R$ 500 milhões.',
            url: 'https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=8881',
            sourceName: 'B3 FNET',
            publishedAt: '2026-11-11T13:00:00.000Z',
            provider: 'B3',
            sourceType: 'OFFICIAL_REGULATORY',
            official: true,
          },
        ],
        new Date('2026-11-11T16:00:00.000Z'),
      );

      const r2 = applyPortfolioNewsState({
        portfolioId,
        events: [baseline, officialFnet],
        persistedStates: persisted1,
        syncState: r1.syncStateToPersist,
        referenceDate: new Date('2026-11-11T13:30:00.000Z'),
      });
      expect(r2.summary).toMatchObject({ newEventsCount: 0, updatedEventsCount: 1 });
      const promoted = r2.events.find((e) => e.canonicalEventId === officialFnet.canonicalEventId);
      expect(promoted?.state).toBe('UPDATED');
      expect(promoted?.updateReasons).toContain('OFFICIAL_SOURCE_ADDED');

      // Mark promoted official event as SEEN
      const persisted2: PersistedPortfolioNewsEventState[] = r2.statesToUpsert.map((i) => ({
        canonicalEventId: i.canonicalEventId,
        firstSeenAt: i.firstSeenAt,
        lastObservedAt: i.lastObservedAt,
        lastSeenByUserAt: i.canonicalEventId === officialFnet.canonicalEventId ? '2026-11-11T14:00:00.000Z' : i.lastSeenByUserAt,
        firstFingerprint: i.firstFingerprint,
        latestFingerprint: i.latestFingerprint,
        state: i.canonicalEventId === officialFnet.canonicalEventId ? ('SEEN' as const) : i.state,
        latestUpdateReasons: i.canonicalEventId === officialFnet.canonicalEventId ? [] : i.latestUpdateReasons,
        eventPublishedAt: i.eventPublishedAt,
        meta: i.meta,
      }));

      // Refresh 3: Suppose official feed is temporarily absent and only media returns
      const r3 = applyPortfolioNewsState({
        portfolioId,
        events: [baseline, mediaNew],
        persistedStates: persisted2,
        syncState: r2.syncStateToPersist,
        referenceDate: new Date('2026-11-11T16:00:00.000Z'),
      });
      expect(r3.summary).toMatchObject({ newEventsCount: 0, updatedEventsCount: 0, seenEventsCount: 1 });
      const returnedMedia = r3.events.find((e) => e.canonicalEventId === mediaNew.canonicalEventId);
      expect(returnedMedia?.state).toBe('SEEN');
      expect(returnedMedia?.isNew).toBe(false);
    });

    it('22. False-positive protection: blocks merging distinct events on same ticker/date, DIVIDEND vs CAPITAL/EARNINGS, and different material numbers', () => {
      const portfolioId = '11111111-1111-4111-8111-111111111111';

      const [petrDividend2Bi] = canonicalizeNewsEvents(
        [
          {
            id: 'media-petr4-div-2bi',
            ticker: 'PETR4',
            headline: 'Petrobras aprova dividendos de R$ 2 bilhões - Suno',
            summary: 'A companhia anunciou dividendos de R$ 2 bilhões.',
            url: 'https://www.suno.com.br/noticias/petr4-dividendos-2bi',
            sourceName: 'Suno',
            publishedAt: '2026-11-11T09:00:00.000Z',
            provider: 'GOOGLE_NEWS',
            sourceType: 'TRUSTED_FINANCIAL_MEDIA',
            official: false,
          },
        ],
        new Date('2026-11-11T12:00:00.000Z'),
      );

      const r1 = applyPortfolioNewsState({
        portfolioId,
        events: [petrDividend2Bi],
        persistedStates: [],
        syncState: null,
        referenceDate: new Date('2026-11-11T10:00:00.000Z'),
      });

      const persisted: PersistedPortfolioNewsEventState[] = r1.statesToUpsert.map((i) => ({
        canonicalEventId: i.canonicalEventId,
        firstSeenAt: i.firstSeenAt,
        lastObservedAt: i.lastObservedAt,
        lastSeenByUserAt: i.lastSeenByUserAt,
        firstFingerprint: i.firstFingerprint,
        latestFingerprint: i.latestFingerprint,
        state: i.state,
        latestUpdateReasons: i.latestUpdateReasons,
        eventPublishedAt: i.eventPublishedAt,
        meta: i.meta,
      }));

      // Case A: Same ticker + same date, DIFFERENT event topic (PETR4 nova emissão)
      const [petrCapitalOffer] = canonicalizeNewsEvents(
        [
          {
            id: 'cvm-petr4-emissao',
            ticker: 'PETR4',
            headline: 'Fato Relevante - Petrobras realiza nova emissão de debêntures',
            summary: 'Oferta de captação de recursos no mercado de capitais.',
            url: 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=1001',
            sourceName: 'CVM Fatos Relevantes',
            publishedAt: '2026-11-11T11:00:00.000Z',
            provider: 'CVM',
            sourceType: 'OFFICIAL_REGULATORY',
            official: true,
          },
        ],
        new Date('2026-11-11T12:00:00.000Z'),
      );

      // Case B: Same ticker + same date, EARNINGS instead of DIVIDEND
      const [petrEarnings] = canonicalizeNewsEvents(
        [
          {
            id: 'cvm-petr4-resultado',
            ticker: 'PETR4',
            headline: 'Divulgação de Resultado do 3T26 da Petrobras',
            summary: 'Lucro líquido consolidado e balanço trimestral.',
            url: 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=1002',
            sourceName: 'CVM IPE',
            publishedAt: '2026-11-11T11:15:00.000Z',
            provider: 'CVM',
            sourceType: 'OFFICIAL_REGULATORY',
            official: true,
          },
        ],
        new Date('2026-11-11T12:00:00.000Z'),
      );

      // Case C: Same ticker + same topic (dividendos), DIFFERENT material number (R$ 5 bilhões vs R$ 2 bilhões)
      const [petrDividend5Bi] = canonicalizeNewsEvents(
        [
          {
            id: 'cvm-petr4-div-5bi',
            ticker: 'PETR4',
            headline: 'Fato Relevante - Petrobras aprova pagamento de dividendos de R$ 5 bilhões',
            summary: 'Nova deliberação adicional de dividendos de R$ 5 bilhões.',
            url: 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=1003',
            sourceName: 'CVM Fatos Relevantes',
            publishedAt: '2026-11-11T11:30:00.000Z',
            provider: 'CVM',
            sourceType: 'OFFICIAL_REGULATORY',
            official: true,
          },
        ],
        new Date('2026-11-11T12:00:00.000Z'),
      );

      const r2 = applyPortfolioNewsState({
        portfolioId,
        events: [petrCapitalOffer, petrEarnings, petrDividend5Bi],
        persistedStates: persisted,
        syncState: r1.syncStateToPersist,
        referenceDate: new Date('2026-11-11T12:00:00.000Z'),
      });

      // None of these three may falsely promote/merge with petrDividend2Bi!
      expect(r2.summary).toMatchObject({ newEventsCount: 3, updatedEventsCount: 0 });
      expect(r2.events.every((e) => e.state === 'NEW')).toBe(true);
      expect(r2.statesToUpsert.some((s) => s.previousCanonicalEventId === petrDividend2Bi.canonicalEventId)).toBe(false);
    });

    it('23. End-to-end controller refresh: Media-Only -> Official-Only without URL overlap produces NEW=0 UPDATED=1 and keeps model/score intact', async () => {
      expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');

      const repo = new InMemoryPortfolioNewsStateRepo();
      const refNow = new Date('2026-11-11T12:00:00.000Z');
      let pipelineEvents: PortfolioNewsEvent[] = canonicalizeNewsEvents(
        [
          {
            id: 'ctrl-media-itub4',
            ticker: 'ITUB4',
            headline: 'Itaú Unibanco aprova recompra de ações de até R$ 3 bilhões - InfoMoney',
            summary: 'Programa de recompra de ações ordinárias e preferenciais aprovado pelo conselho.',
            url: 'https://www.infomoney.com.br/mercados/itau-aprova-recompra-acoes-3bi/',
            sourceName: 'InfoMoney',
            publishedAt: '2026-11-11T09:00:00.000Z',
            provider: 'GOOGLE_NEWS',
            sourceType: 'TRUSTED_FINANCIAL_MEDIA',
            official: false,
          },
        ],
        refNow,
      );

      const useCase = new GetOpportunityRadarUseCase(
        {
          findById: vi.fn().mockResolvedValue({
            id: 'portfolio-r1',
            userId: 'user-r1',
            name: 'Carteira Real',
            baseCurrency: 'BRL',
          }),
        } as any,
        {} as any,
        { list: vi.fn().mockResolvedValue({ items: [], hasMore: false }) } as any,
        {
          execute: vi.fn().mockResolvedValue({
            positions: [
              { assetId: 'asset-itub', ticker: 'ITUB4', assetName: 'Itau Unibanco', status: 'VALUED', marketValue: { amount: '25000.00' } },
            ],
            totalValue: '100000',
          }),
        } as any,
        { getActiveStrategy: vi.fn().mockResolvedValue(null) } as any,
        new OpportunityRadarCacheService(),
        { getToken: () => undefined } as any,
        {
          getPortfolioNews: vi.fn().mockImplementation(async () => ({
            events: pipelineEvents,
            totalEvents: pipelineEvents.length,
            byAssetCount: { ITUB4: pipelineEvents.length },
            digest: buildDailyNewsDigest(pipelineEvents, { referenceDate: refNow, maxItems: 10 }),
            assetDailyStatus: { ITUB4: 'MATERIAL_EVENT' },
            metrics: {
              breakingCount: pipelineEvents.length,
              recentCount: pipelineEvents.length,
              officialCount: pipelineEvents.filter((e) => e.official).length,
              highImportanceCount: 1,
              materialCount: 1,
              criticalCount: 0,
              highCount: 1,
              mediumCount: 0,
              routineCount: 0,
              totalAuditedAssets: 1,
              assetsWithNews: 1,
              assetsWithoutNews: 0,
              officialCoverageCount: 1,
              providerStatus: {
                brapiNewsAvailable: false,
                brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
                officialStatus: 'OFFICIAL_PROVIDER_AVAILABLE',
                cvmStatus: 'AVAILABLE',
                fnetStatus: 'AVAILABLE',
                fallbackActive: true,
                providersUsed: ['Google News RSS (Agregador)'],
              },
            },
            asOf: refNow.toISOString(),
          })),
        } as any,
        repo,
      );
      const ctrl = new PortfolioOpportunityRadarController(useCase);
      const principal = { userId: 'user-r1', sessionId: 'sess-r1' } as any;

      // Refresh 1: Baseline media-only
      const res1 = await ctrl.getPortfolioNews('portfolio-r1', principal);
      expect(res1.data.newsState).toMatchObject({ newEventsCount: 0, updatedEventsCount: 0, seenEventsCount: 0 });
      expect(res1.data.events[0].official).toBe(false);

      // Refresh 2: Official-only arrives with no media URL
      const officialEvents = canonicalizeNewsEvents(
        [
          {
            id: 'ctrl-cvm-itub4',
            ticker: 'ITUB4',
            headline: 'Fato Relevante - Itaú Unibanco aprova programa de recompra de ações de R$ 3 bilhões',
            summary: 'Conselho de administração do Itaú Unibanco aprovou programa de recompra de ações.',
            url: 'https://www.rad.cvm.gov.br/ENET/frmExibirArquivoIPEExterno.aspx?ID=777222',
            sourceName: 'CVM Fatos Relevantes',
            publishedAt: '2026-11-11T12:00:00.000Z',
            provider: 'CVM',
            sourceType: 'OFFICIAL_REGULATORY',
            official: true,
          },
        ],
        refNow,
      );
      pipelineEvents = officialEvents;

      const res2 = await ctrl.refreshPortfolioNews('portfolio-r1', principal);
      expect(res2.data.newsState).toMatchObject({
        newEventsCount: 0,
        updatedEventsCount: 1,
      });
      expect(res2.data.events).toHaveLength(1);
      expect(res2.data.events[0]).toMatchObject({
        canonicalEventId: officialEvents[0].canonicalEventId,
        official: true,
        state: 'UPDATED',
      });
      expect(res2.data.events[0].updateReasons).toContain('OFFICIAL_SOURCE_ADDED');
    });
  });
});
