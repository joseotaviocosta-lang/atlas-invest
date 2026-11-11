import { describe, it, expect } from 'vitest';
import {
  OPPORTUNITY_MODEL_VERSION,
  applyPortfolioNewsState,
  selectAlertEligibleNewsEvents,
  deliverMaterialNewsAlerts,
  FakeNewsAlertNotifier,
  classifyNewsMateriality,
  calculateNewsScoreV2,
  sanitizeAlertFailureReason,
  type PortfolioNewsEvent,
  type PortfolioNewsAlertAuditItem,
} from '../../packages/market-data/src/index';

function makeEvent(overrides: Partial<PortfolioNewsEvent> = {}): PortfolioNewsEvent {
  const headline =
    overrides.headline ?? 'PETROBRAS (PETR4): Fato Relevante — Dividendo Extraordinário';
  return {
    id: overrides.id ?? 'evt_petr4_hist_1',
    canonicalEventId: overrides.canonicalEventId ?? overrides.id ?? 'evt_petr4_hist_1',
    headline,
    summary: overrides.summary ?? 'Comunicado oficial registrado na CVM.',
    publishedAt: overrides.publishedAt ?? '2026-11-11T10:00:00.000Z',
    importance: overrides.importance ?? 5,
    sentiment: overrides.sentiment ?? 'POSITIVE',
    sentimentScore: overrides.sentimentScore ?? 0.85,
    sentimentMethod: overrides.sentimentMethod ?? 'OFFICIAL_EVENT_RULE',
    eventType: overrides.eventType ?? 'FACT_RELEVANT',
    assets: overrides.assets ?? ['PETR4'],
    primaryTickers: overrides.primaryTickers ?? ['PETR4'],
    secondaryTickers: [],
    sources: overrides.sources ?? [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc/1' }],
    provider: overrides.provider ?? 'CVM',
    sourceType: overrides.sourceType ?? 'OFFICIAL_REGULATORY',
    official: overrides.official ?? true,
    freshness: 'BREAKING',
    decayWeight: 1.0,
    materiality: overrides.materiality ?? 'HIGH',
    materialityScore: 84,
    materialityReason: overrides.materialityReason ?? 'Fato relevante financeiro aprovado',
    state: overrides.state ?? 'NEW',
    firstSeenAt: '2026-11-11T10:05:00.000Z',
    lastObservedAt: '2026-11-11T10:05:00.000Z',
    lastSeenByUserAt: null,
    eventVersionFingerprint: overrides.eventVersionFingerprint ?? 'fp_v1',
    ...overrides,
  };
}

describe('PROJECT ATLAS — APP-16O: Material News Alert History Audit Payloads', () => {
  it('1. Captures rich sanitized audit snapshot on DELIVERED and failure -> retry -> DELIVERED without altering scores or policy', async () => {
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');

    const ev = makeEvent({ id: 'evt_retry_1', canonicalEventId: 'evt_retry_1' });
    const matBefore = classifyNewsMateriality({
      headline: ev.headline,
      summary: ev.summary,
      eventType: ev.eventType,
      official: ev.official,
      importance: ev.importance,
    });
    const scoreBefore = calculateNewsScoreV2([ev], 'PETR4');

    const baseState = applyPortfolioNewsState({
      portfolioId: 'port_1',
      events: [makeEvent({ id: 'seed_0', canonicalEventId: 'seed_0', assets: ['WEGE3'], primaryTickers: ['WEGE3'], headline: 'WEGE3 seed' })],
      persistedStates: [],
      syncState: null,
      referenceDate: new Date('2026-11-10T10:00:00.000Z'),
    });

    const state1 = applyPortfolioNewsState({
      portfolioId: 'port_1',
      events: [ev],
      persistedStates: baseState.statesToUpsert,
      syncState: baseState.syncStateToPersist,
      referenceDate: new Date('2026-11-11T10:05:00.000Z'),
    });

    const selection = selectAlertEligibleNewsEvents({
      portfolioId: 'port_1',
      events: state1.events,
      persistedStates: state1.statesToUpsert,
    });
    expect(selection.eligibleCandidates).toHaveLength(1);

    const notifier = new FakeNewsAlertNotifier();
    notifier.setMode('DELIVERY_FAILED', 'Toast COM error\n  at winrt.ts:42 token=secret_xyz');

    const releasedLog: PortfolioNewsAlertAuditItem[] = [];
    const confirmedLog: PortfolioNewsAlertAuditItem[] = [];

    const failRes = await deliverMaterialNewsAlerts({
      portfolioId: 'port_1',
      candidates: selection.eligibleCandidates,
      notifier,
      ports: {
        claimPendingAlerts: async ({ candidates }) => candidates,
        confirmAlertsDelivered: async ({ delivered }) => {
          confirmedLog.push(...delivered);
        },
        releaseAlertsClaim: async ({ items }) => {
          releasedLog.push(...items);
        },
      },
    });

    expect(failRes.status).toBe('DELIVERY_FAILED');
    expect(confirmedLog).toHaveLength(0);
    expect(releasedLog).toHaveLength(1);
    expect(releasedLog[0]!.deliveryStatus).toBe('DELIVERY_FAILED');
    expect(releasedLog[0]!.failureReason).toBe('Toast COM error');
    expect(releasedLog[0]!.failureReason).not.toContain('winrt.ts');
    expect(releasedLog[0]!.alertAttemptId).toBeDefined();
    expect(releasedLog[0]!.sourceLabelSnapshot).toBe('CVM');

    // Sanitizer explicitly strips stack traces & secrets
    expect(sanitizeAlertFailureReason('Fail\n  at stack:1 bearer=abc')).toBe('Fail');
    expect(sanitizeAlertFailureReason('Error token=secret123 near host')).toBe(
      'Error token=[REDACTED] near host',
    );

    // Retry succeeds -> generates distinct attemptId & DELIVERED snapshot
    notifier.setMode('DELIVERED');
    const okRes = await deliverMaterialNewsAlerts({
      portfolioId: 'port_1',
      candidates: selection.eligibleCandidates,
      notifier,
      ports: {
        claimPendingAlerts: async ({ candidates }) => candidates,
        confirmAlertsDelivered: async ({ delivered }) => {
          confirmedLog.push(...delivered);
        },
        releaseAlertsClaim: async ({ items }) => {
          releasedLog.push(...items);
        },
      },
    });

    expect(okRes.status).toBe('DELIVERED');
    expect(confirmedLog).toHaveLength(1);
    expect(confirmedLog[0]!.deliveryStatus).toBe('DELIVERED');
    expect(confirmedLog[0]!.alertAttemptId).not.toBe(releasedLog[0]!.alertAttemptId);

    const matAfter = classifyNewsMateriality({
      headline: ev.headline,
      summary: ev.summary,
      eventType: ev.eventType,
      official: ev.official,
      importance: ev.importance,
    });
    const scoreAfter = calculateNewsScoreV2([ev], 'PETR4');
    expect(matAfter).toEqual(matBefore);
    expect(scoreAfter).toEqual(scoreBefore);
  });

  it('2. Batch delivery (>3 HIGH) and individual CRITICAL pass coherent linkage metadata in confirm payload', async () => {
    const events: PortfolioNewsEvent[] = [
      makeEvent({
        id: 'crit_1',
        canonicalEventId: 'crit_1',
        materiality: 'CRITICAL',
        assets: ['BBDC4'],
        primaryTickers: ['BBDC4'],
        headline: 'BBDC4 Fato Crítico',
        eventVersionFingerprint: 'fp_crit',
      }),
      ...(['PETR4', 'VALE3', 'BBAS3', 'ITUB4', 'WEGE3'] as const).map((ticker, idx) =>
        makeEvent({
          id: `high_${idx}`,
          canonicalEventId: `high_${idx}`,
          materiality: 'HIGH',
          assets: [ticker],
          primaryTickers: [ticker],
          headline: `${ticker} Fato Relevante ${idx}`,
          eventVersionFingerprint: `fp_h_${idx}`,
        }),
      ),
    ];

    const selection = selectAlertEligibleNewsEvents({
      portfolioId: 'port_batch',
      events,
      persistedStates: [],
    });
    expect(selection.eligibleCandidates).toHaveLength(6);

    const confirmedLog: PortfolioNewsAlertAuditItem[] = [];
    const notifier = new FakeNewsAlertNotifier();

    const res = await deliverMaterialNewsAlerts({
      portfolioId: 'port_batch',
      candidates: selection.eligibleCandidates,
      notifier,
      ports: {
        claimPendingAlerts: async ({ candidates }) => candidates,
        confirmAlertsDelivered: async ({ delivered }) => {
          confirmedLog.push(...delivered);
        },
        releaseAlertsClaim: async () => {},
      },
    });

    expect(res.status).toBe('DELIVERED');
    expect(confirmedLog).toHaveLength(6);

    const criticalAudit = confirmedLog.find((c) => c.canonicalEventId === 'crit_1');
    expect(criticalAudit?.alertType).toBe('CRITICAL_NEW');
    expect(criticalAudit?.batchEventCount).toBe(1);

    const batchAudits = confirmedLog.filter((c) => c.canonicalEventId !== 'crit_1');
    expect(batchAudits).toHaveLength(5);
    const sharedAttemptId = batchAudits[0]!.alertAttemptId;
    for (const item of batchAudits) {
      expect(item.alertType).toBe('MATERIAL_BATCH_SUMMARY');
      expect(item.batchEventCount).toBe(5);
      expect(item.batchTickers).toEqual(['PETR4', 'VALE3', 'BBAS3', 'ITUB4', 'WEGE3']);
      expect(item.alertAttemptId).toBe(sharedAttemptId);
    }
  });
});
