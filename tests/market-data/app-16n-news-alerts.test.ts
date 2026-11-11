import { describe, it, expect } from 'vitest';
import {
  OPPORTUNITY_MODEL_VERSION,
  applyPortfolioNewsState,
  selectAlertEligibleNewsEvents,
  buildMaterialNewsAlertPayloads,
  deliverMaterialNewsAlerts,
  FakeNewsAlertNotifier,
  classifyNewsMateriality,
  calculateNewsScoreV2,
  type PortfolioNewsEvent,
  type PersistedPortfolioNewsEventState,
  type PersistedPortfolioNewsSyncState,
} from '../../packages/market-data/src/index';

function makeEvent(overrides: Partial<PortfolioNewsEvent> = {}): PortfolioNewsEvent {
  const headline =
    overrides.headline ?? 'PETROBRAS (PETR4): Fato Relevante — Distribuição extraordinária aprovada';
  return {
    id: overrides.id ?? 'evt_petr4_1',
    canonicalEventId: overrides.canonicalEventId ?? overrides.id ?? 'evt_petr4_1',
    headline,
    summary: overrides.summary ?? 'Comunicado oficial registrado na CVM.',
    publishedAt: overrides.publishedAt ?? '2026-11-11T10:00:00.000Z',
    importance: overrides.importance ?? 5,
    sentiment: overrides.sentiment ?? 'POSITIVE',
    sentimentScore: overrides.sentimentScore ?? 0.8,
    sentimentMethod: overrides.sentimentMethod ?? 'OFFICIAL_EVENT_RULE',
    eventType: overrides.eventType ?? 'FACT_RELEVANT',
    assets: overrides.assets ?? ['PETR4'],
    primaryTickers: overrides.primaryTickers ?? ['PETR4'],
    secondaryTickers: overrides.secondaryTickers ?? [],
    sources: overrides.sources ?? [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc/1' }],
    provider: overrides.provider ?? 'CVM',
    sourceType: overrides.sourceType ?? 'OFFICIAL_REGULATORY',
    official: overrides.official ?? true,
    freshness: overrides.freshness ?? 'BREAKING',
    decayWeight: overrides.decayWeight ?? 1.0,
    materiality: overrides.materiality ?? 'HIGH',
    materialityScore: overrides.materialityScore ?? 82,
    materialityReason: overrides.materialityReason ?? 'Fato relevante financeiro relevante aprovado',
    state: overrides.state ?? 'NEW',
    firstSeenAt: overrides.firstSeenAt ?? '2026-11-11T10:05:00.000Z',
    lastObservedAt: overrides.lastObservedAt ?? '2026-11-11T10:05:00.000Z',
    lastSeenByUserAt: overrides.lastSeenByUserAt ?? null,
    eventVersionFingerprint: overrides.eventVersionFingerprint ?? 'fp_v1_petr4',
    isNew: overrides.state ? overrides.state === 'NEW' : true,
    isUpdated: overrides.state === 'UPDATED',
    isSeen: overrides.state === 'SEEN',
    ...overrides,
  };
}

describe('PROJECT ATLAS — APP-16N: Local Material News Alerts Engine', () => {
  const portfolioId = '00000000-0000-4000-8000-000000000002';

  it('1. AQ: NEW + HIGH emits 1 individual material alert with official provenance', async () => {
    const event = makeEvent({
      state: 'NEW',
      materiality: 'HIGH',
      official: true,
      provider: 'CVM',
    });

    const { eligibleCandidates } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: [event],
    });
    expect(eligibleCandidates).toHaveLength(1);

    const notifier = new FakeNewsAlertNotifier();
    const res = await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
    });

    expect(res.status).toBe('DELIVERED');
    expect(res.deliveredCount).toBe(1);
    expect(notifier.captured).toHaveLength(1);
    expect(notifier.captured[0]!.type).toBe('MATERIAL_NEW');
    expect(notifier.captured[0]!.title).toBe('Atlas Invest');
    expect(notifier.captured[0]!.body).toContain('PETR4 — Nova notícia de alta relevância');
    expect(notifier.captured[0]!.body).toContain('Fonte oficial: CVM');
  });

  it('2. AR: NEW + CRITICAL emits dedicated critical alert referencing materialityReason only', async () => {
    const event = makeEvent({
      id: 'evt_irbr3',
      canonicalEventId: 'evt_irbr3',
      assets: ['IRBR3'],
      primaryTickers: ['IRBR3'],
      state: 'NEW',
      materiality: 'CRITICAL',
      materialityReason: 'Recuperação judicial / risco material detectado',
      headline: 'IRBR3 comunica evento societário crítico',
      official: true,
      provider: 'B3',
      sources: [{ name: 'B3 FNET', url: 'https://fnet.bmfbovespa.com.br/1' }],
    });

    const { eligibleCandidates } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: [event],
    });

    const notifier = new FakeNewsAlertNotifier();
    await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
    });

    expect(notifier.captured).toHaveLength(1);
    expect(notifier.captured[0]!.type).toBe('CRITICAL_NEW');
    expect(notifier.captured[0]!.title).toBe('Atlas Invest — Evento crítico');
    expect(notifier.captured[0]!.body).toContain('IRBR3');
    expect(notifier.captured[0]!.body).toContain('Recuperação judicial / risco material detectado');
    expect(notifier.captured[0]!.body).toContain('Fonte oficial: B3');
  });

  it('3. AS: UPDATED + HIGH uses update wording ("Atualização importante") rather than "Nova notícia"', async () => {
    const event = makeEvent({
      state: 'UPDATED',
      materiality: 'HIGH',
      official: false,
      provider: 'GOOGLE_NEWS',
      sourceType: 'TRUSTED_FINANCIAL_MEDIA',
      sources: [{ name: 'InfoMoney', url: 'https://infomoney.com.br/petr4' }],
    });

    const { eligibleCandidates } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: [event],
    });

    const notifier = new FakeNewsAlertNotifier();
    await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
    });

    expect(notifier.captured).toHaveLength(1);
    expect(notifier.captured[0]!.type).toBe('MATERIAL_UPDATE');
    expect(notifier.captured[0]!.body).toContain('Atualização importante — PETR4');
    expect(notifier.captured[0]!.body).not.toContain('Nova notícia');
    expect(notifier.captured[0]!.body).not.toContain('Fonte oficial:');
  });

  it('4-8. AT–AX: suppresses MEDIUM, LOW, ROUTINE, SEEN (even CRITICAL/HIGH), and UNCHANGED CRITICAL by default', () => {
    const events: PortfolioNewsEvent[] = [
      makeEvent({ id: 'med_new', state: 'NEW', materiality: 'MEDIUM' }),
      makeEvent({ id: 'low_new', state: 'NEW', materiality: 'LOW' }),
      makeEvent({ id: 'routine_new', state: 'NEW', materiality: 'ROUTINE' }),
      makeEvent({ id: 'seen_high', state: 'SEEN', materiality: 'HIGH' }),
      makeEvent({ id: 'seen_crit', state: 'SEEN', materiality: 'CRITICAL' }),
      makeEvent({ id: 'unchanged_crit', state: 'UNCHANGED', materiality: 'CRITICAL' }),
    ];

    const { eligibleCandidates, diagnostics } = selectAlertEligibleNewsEvents({
      portfolioId,
      events,
    });

    expect(eligibleCandidates).toHaveLength(0);
    expect(diagnostics.eligibleAlerts).toBe(0);
    expect(diagnostics.suppressedByMateriality).toBe(3);
    expect(diagnostics.suppressedByState).toBe(3);
  });

  it('9-10. AY & AZ: repeated refresh with same fingerprint emits 1 total alert; new material version alerts once again', async () => {
    const ref1 = new Date('2026-11-11T10:00:00.000Z');
    const syncInit: PersistedPortfolioNewsSyncState = {
      portfolioId,
      newsStateInitializedAt: '2026-11-01T00:00:00.000Z',
      lastRefreshedAt: '2026-11-10T00:00:00.000Z',
    };
    const priorSeed: PersistedPortfolioNewsEventState[] = [
      {
        portfolioId,
        canonicalEventId: 'evt_seed_old',
        firstSeenAt: '2026-11-01T00:00:00.000Z',
        lastObservedAt: '2026-11-10T00:00:00.000Z',
        lastSeenByUserAt: null,
        firstFingerprint: 'fp_old',
        latestFingerprint: 'fp_old',
        state: 'UNCHANGED',
        latestUpdateReasons: [],
        eventPublishedAt: '2026-11-01T00:00:00.000Z',
        meta: { alertBaselineRecordedAt: '2026-11-10T00:00:00.000Z' },
      },
    ];

    // Refresh 1: brand-new HIGH event arrives
    const rawV1 = makeEvent({
      id: 'evt_petr4_recorrente',
      canonicalEventId: 'evt_petr4_recorrente',
      headline: 'PETROBRAS (PETR4): Conselho aprova investimento de R$ 10 bi',
      materiality: 'HIGH',
      official: false,
      provider: 'GOOGLE_NEWS',
      sources: [{ name: 'Valor', url: 'https://valor.globo.com/a' }],
    });

    const s1 = applyPortfolioNewsState({
      portfolioId,
      events: [rawV1],
      persistedStates: priorSeed,
      syncState: syncInit,
      referenceDate: ref1,
    });
    const fp1 = s1.events[0]!.eventVersionFingerprint!;

    const notifier = new FakeNewsAlertNotifier();
    let totalAlertsSent = 0;

    // Simulate 5 repeated refreshes with the same event version fingerprint
    let currentPersisted: PersistedPortfolioNewsEventState[] = s1.statesToUpsert.map((u) => ({ ...u }));
    for (let i = 0; i < 5; i++) {
      const stateIter =
        i === 0
          ? s1
          : applyPortfolioNewsState({
              portfolioId,
              events: [rawV1],
              persistedStates: currentPersisted,
              syncState: s1.syncStateToPersist,
              referenceDate: new Date(ref1.getTime() + i * 60_000),
            });

      const { eligibleCandidates } = selectAlertEligibleNewsEvents({
        portfolioId,
        events: stateIter.events,
        persistedStates: stateIter.statesToUpsert,
      });

      if (eligibleCandidates.length > 0) {
        const delivery = await deliverMaterialNewsAlerts({
          portfolioId,
          candidates: eligibleCandidates,
          notifier,
        });
        totalAlertsSent += delivery.deliveredCount;
        // Persist delivered fingerprint into meta
        currentPersisted = stateIter.statesToUpsert.map((u) =>
          u.canonicalEventId === 'evt_petr4_recorrente'
            ? {
                ...u,
                meta: {
                  ...u.meta,
                  alertedVersionFingerprint: fp1,
                  alertedAt: ref1.toISOString(),
                },
              }
            : { ...u },
        );
      } else {
        currentPersisted = stateIter.statesToUpsert.map((u) => ({ ...u }));
      }
    }

    expect(totalAlertsSent).toBe(1);
    expect(notifier.captured).toHaveLength(1);

    // Refresh 6: event receives a material official update -> fingerprint changes (fp2 != fp1) -> alerts ONCE again
    const rawV2 = makeEvent({
      id: 'evt_petr4_recorrente',
      canonicalEventId: 'evt_petr4_recorrente',
      headline: 'PETROBRAS (PETR4): Conselho aprova investimento de R$ 10 bi',
      materiality: 'CRITICAL',
      materialityReason: 'Fato relevante CVM com elevação para risco/oportunidade crítica',
      official: true,
      provider: 'CVM',
      sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc/99' }],
    });

    const s6 = applyPortfolioNewsState({
      portfolioId,
      events: [rawV2],
      persistedStates: currentPersisted,
      syncState: s1.syncStateToPersist,
      referenceDate: new Date('2026-11-11T12:00:00.000Z'),
    });
    expect(s6.events[0]!.state).toBe('UPDATED');
    expect(s6.events[0]!.eventVersionFingerprint).not.toBe(fp1);

    const { eligibleCandidates: eligibleV2 } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: s6.events,
      persistedStates: s6.statesToUpsert,
    });
    expect(eligibleV2).toHaveLength(1);

    await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleV2,
      notifier,
    });
    expect(notifier.captured).toHaveLength(2);
    expect(notifier.captured[1]!.type).toBe('CRITICAL_UPDATE');
  });

  it('11-12. BA & BB: delivery failure and permission denied preserve event and do not mark delivered (retry succeeds)', async () => {
    const candidate = makeEvent({ state: 'NEW', materiality: 'HIGH', eventVersionFingerprint: 'fp_retry_1' });
    const { eligibleCandidates } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: [candidate],
    });

    const notifier = new FakeNewsAlertNotifier();
    notifier.setMode('DELIVERY_FAILED', 'Windows toast subsystem busy');

    const failRes = await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
    });
    expect(failRes.status).toBe('DELIVERY_FAILED');
    expect(failRes.deliveredCount).toBe(0);
    expect(failRes.deliveredEventKeys).toHaveLength(0);

    notifier.setMode('NOTIFICATIONS_PERMISSION_DENIED', 'User disabled OS notifications');
    const deniedRes = await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
    });
    expect(deniedRes.status).toBe('NOTIFICATIONS_PERMISSION_DENIED');
    expect(deniedRes.deliveredCount).toBe(0);
    expect(deniedRes.deliveredEventKeys).toHaveLength(0);

    // Retry later succeeds cleanly
    notifier.setMode('DELIVERED');
    const okRes = await deliverMaterialNewsAlerts({
      portfolioId,
      candidates: eligibleCandidates,
      notifier,
    });
    expect(okRes.status).toBe('DELIVERED');
    expect(okRes.deliveredCount).toBe(1);
  });

  it('13-14. BC & BD: toggle OFF sends 0 OS alerts; pre-existing events do not fire retroactively when toggled ON later', () => {
    const preExisting = makeEvent({
      id: 'evt_while_off',
      state: 'NEW',
      materiality: 'HIGH',
      firstSeenAt: '2026-11-11T09:00:00.000Z',
    });

    const persistedPreExisting: PersistedPortfolioNewsEventState = {
      portfolioId,
      canonicalEventId: 'evt_while_off',
      firstSeenAt: '2026-11-11T09:00:00.000Z',
      lastObservedAt: '2026-11-11T09:00:00.000Z',
      lastSeenByUserAt: null,
      firstFingerprint: 'fp_v1_petr4',
      latestFingerprint: 'fp_v1_petr4',
      state: 'NEW',
      latestUpdateReasons: [],
      eventPublishedAt: '2026-11-11T09:00:00.000Z',
      meta: {},
    };

    const offSelection = selectAlertEligibleNewsEvents({
      portfolioId,
      events: [preExisting],
      persistedStates: [persistedPreExisting],
      options: { enabled: false },
    });
    expect(offSelection.eligibleCandidates).toHaveLength(0);
    expect(offSelection.diagnostics.suppressedByToggle).toBe(1);

    // Later user activates alerts at 10:00 -> pre-existing event from 09:00 must NOT retroactively fire
    const activatedAt = '2026-11-11T10:00:00.000Z';
    const postActivationNew = makeEvent({
      id: 'evt_after_on',
      canonicalEventId: 'evt_after_on',
      state: 'NEW',
      materiality: 'HIGH',
      eventVersionFingerprint: 'fp_after_on',
      firstSeenAt: '2026-11-11T10:05:00.000Z',
      lastObservedAt: '2026-11-11T10:05:00.000Z',
    });
    const persistedPostActivation: PersistedPortfolioNewsEventState = {
      ...persistedPreExisting,
      canonicalEventId: 'evt_after_on',
      firstSeenAt: '2026-11-11T10:05:00.000Z',
      lastObservedAt: '2026-11-11T10:05:00.000Z',
      firstFingerprint: 'fp_after_on',
      latestFingerprint: 'fp_after_on',
    };

    const afterSelection = selectAlertEligibleNewsEvents({
      portfolioId,
      events: [preExisting, postActivationNew],
      persistedStates: [persistedPreExisting, persistedPostActivation],
      options: { enabled: true, alertsActivatedAt: activatedAt },
    });
    expect(afterSelection.eligibleCandidates).toHaveLength(1);
    expect(afterSelection.eligibleCandidates[0]!.canonicalEventId).toBe('evt_after_on');
  });

  it('15. AJ & AK: APP-16N rollout suppresses pre-existing persisted NEW/UPDATED events without marking them SEEN', () => {
    const existingHighEvent = makeEvent({
      id: 'evt_pre16n_new',
      canonicalEventId: 'evt_pre16n_new',
      headline: 'VALE3: Fato Relevante pré-APP-16N',
      materiality: 'HIGH',
    });

    // Persisted under APP-16M before APP-16N alert metadata existed
    const pre16nState: PersistedPortfolioNewsEventState = {
      portfolioId,
      canonicalEventId: 'evt_pre16n_new',
      firstSeenAt: '2026-11-10T10:00:00.000Z',
      lastObservedAt: '2026-11-10T10:00:00.000Z',
      lastSeenByUserAt: null,
      firstFingerprint: '', // will match after first compute, wait — use actual applied fingerprint:
      latestFingerprint: '',
      state: 'NEW',
      latestUpdateReasons: [],
      eventPublishedAt: existingHighEvent.publishedAt,
      meta: { official: true, materiality: 'HIGH', tickers: ['VALE3'] },
    };

    // Simulate APP-16M prior pass to obtain authentic fingerprint before APP-16N meta existed
    const app16mBaseline = applyPortfolioNewsState({
      portfolioId,
      events: [existingHighEvent],
      persistedStates: [{ ...pre16nState, canonicalEventId: 'other_seed' }],
      syncState: {
        portfolioId,
        newsStateInitializedAt: '2026-11-09T00:00:00.000Z',
        lastRefreshedAt: '2026-11-10T00:00:00.000Z',
      },
      referenceDate: new Date('2026-11-10T10:00:00.000Z'),
    });
    const fpExisting = app16mBaseline.events[0]!.eventVersionFingerprint!;

    // Strip APP-16N fields as if row came straight from APP-16M database prior to upgrade
    const pre16nDbRow: PersistedPortfolioNewsEventState = {
      ...app16mBaseline.statesToUpsert[0]!,
      state: 'NEW',
      latestFingerprint: fpExisting,
      meta: {
        official: app16mBaseline.statesToUpsert[0]!.meta.official,
        materiality: app16mBaseline.statesToUpsert[0]!.meta.materiality,
        tickers: app16mBaseline.statesToUpsert[0]!.meta.tickers,
        headlineCore: app16mBaseline.statesToUpsert[0]!.meta.headlineCore,
      },
    };

    // First APP-16N rollout refresh runs: event stays NEW in Inbox, NOT retroactively alerted
    const rolloutResult = applyPortfolioNewsState({
      portfolioId,
      events: [existingHighEvent],
      persistedStates: [pre16nDbRow],
      syncState: app16mBaseline.syncStateToPersist,
      referenceDate: new Date('2026-11-11T10:00:00.000Z'),
    });

    expect(rolloutResult.events[0]!.state).toBe('NEW');
    expect(rolloutResult.statesToUpsert[0]!.meta.alertBaselineVersionSuppressed).toBe(fpExisting);

    const rolloutSelection = selectAlertEligibleNewsEvents({
      portfolioId,
      events: rolloutResult.events,
      persistedStates: rolloutResult.statesToUpsert,
    });
    expect(rolloutSelection.eligibleCandidates).toHaveLength(0);
    expect(rolloutSelection.diagnostics.suppressedBaseline).toBe(1);
  });

  it('16-17. BE, BF & BG: batches >3 non-critical HIGH events into 1 summary while keeping CRITICAL individual', () => {
    const candidates = [
      makeEvent({ id: 'c1', canonicalEventId: 'c1', assets: ['IRBR3'], primaryTickers: ['IRBR3'], materiality: 'CRITICAL', materialityReason: 'Risco crítico de liquidez' }),
      makeEvent({ id: 'h1', canonicalEventId: 'h1', assets: ['PETR4'], primaryTickers: ['PETR4'], materiality: 'HIGH' }),
      makeEvent({ id: 'h2', canonicalEventId: 'h2', assets: ['VALE3'], primaryTickers: ['VALE3'], materiality: 'HIGH' }),
      makeEvent({ id: 'h3', canonicalEventId: 'h3', assets: ['BBAS3'], primaryTickers: ['BBAS3'], materiality: 'HIGH' }),
      makeEvent({ id: 'h4', canonicalEventId: 'h4', assets: ['ITUB4'], primaryTickers: ['ITUB4'], materiality: 'HIGH' }),
      makeEvent({ id: 'h5', canonicalEventId: 'h5', assets: ['WEGE3'], primaryTickers: ['WEGE3'], materiality: 'HIGH' }),
    ].map((e, idx) => ({ ...e, eventVersionFingerprint: `fp_${idx}` }));

    const { eligibleCandidates } = selectAlertEligibleNewsEvents({
      portfolioId,
      events: candidates,
    });
    expect(eligibleCandidates).toHaveLength(6);

    const payloads = buildMaterialNewsAlertPayloads(eligibleCandidates);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.kind).toBe('SINGLE');
    expect(payloads[0]!.type).toBe('CRITICAL_NEW');
    expect(payloads[0]!.body).toContain('IRBR3');
    expect(payloads[1]!.kind).toBe('BATCH');
    expect(payloads[1]!.type).toBe('MATERIAL_BATCH_SUMMARY');
    expect(payloads[1]!.body).toContain('5 novas notícias relevantes na sua carteira.');
    expect(payloads[1]!.body).toContain('PETR4, VALE3, BBAS3 e mais 2.');
    expect(payloads[1]!.coveredEventKeys).toHaveLength(5);
  });

  it('18. BI, BK, BL & BQ: isolates portfolios, exposes zero financial balances, and never alters model/scores', () => {
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');

    const event = makeEvent({ id: 'evt_shared', canonicalEventId: 'evt_shared', state: 'NEW', materiality: 'HIGH' });
    const matBefore = classifyNewsMateriality({
      headline: event.headline,
      summary: event.summary,
      eventType: event.eventType,
      official: event.official,
      importance: event.importance,
    });
    const scoreBefore = calculateNewsScoreV2([event], 'PETR4');

    const selA = selectAlertEligibleNewsEvents({
      portfolioId: 'portfolio-A',
      events: [event],
      persistedStates: [
        {
          canonicalEventId: 'evt_shared',
          meta: { alertedVersionFingerprint: event.eventVersionFingerprint },
        },
      ],
    });
    const selB = selectAlertEligibleNewsEvents({
      portfolioId: 'portfolio-B',
      events: [event],
      persistedStates: [],
    });

    expect(selA.eligibleCandidates).toHaveLength(0);
    expect(selB.eligibleCandidates).toHaveLength(1);

    const payloadsB = buildMaterialNewsAlertPayloads(selB.eligibleCandidates);
    expect(payloadsB[0]!.body).not.toMatch(/patrimônio|preço médio|saldo|custo/i);

    const matAfter = classifyNewsMateriality({
      headline: event.headline,
      summary: event.summary,
      eventType: event.eventType,
      official: event.official,
      importance: event.importance,
    });
    const scoreAfter = calculateNewsScoreV2([event], 'PETR4');
    expect(matAfter).toEqual(matBefore);
    expect(scoreAfter).toEqual(scoreBefore);
  });
});
