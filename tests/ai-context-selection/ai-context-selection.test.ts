import { describe, it, expect } from 'vitest';
import {
  selectGroundingFacts,
  buildProviderProjection,
  buildCompactConversationPrompt,
  buildConversationPrompt,
  resolveEvidenceReference,
  resolveEvidenceReferences,
  resolveClaimReferences,
  validateGroundedClaims,
  validateExplanationEvidence,
  classifyBudgetUtilization,
  GROUNDING_SELECTION_POLICY_VERSION,
  AI_DEFAULT_MAX_CONTEXT_BYTES,
  AI_BUDGET_UTILIZATION_BUCKETS,
  MAX_AI_TIMELINE_EVENTS,
  PORTFOLIO_AI_CONVERSATION_POLICY_V1,
  COMPACT_CONTEXT_FORMAT_ADDENDUM,
  type ExplanationIntent,
  type GroundedClaimInput,
} from '@atlas/ai-engine';
import {
  portfolioContext,
  assetContext,
  timelineContext,
  assetTimelineContext,
  currencyInput,
  makeEvents,
  PETR4,
  bytes,
} from './fixtures';

const Q = 'Explique os dados da minha carteira neste periodo.';

function select(context: ReturnType<typeof portfolioContext>, intent: ExplanationIntent) {
  return selectGroundingFacts({ context, intent });
}

function compact(context: never, intent: ExplanationIntent, question = Q) {
  return buildCompactConversationPrompt(context, question, intent, []);
}

const categoriesOf = (facts: readonly { category: string }[]) =>
  new Set(facts.map((f) => f.category));

// ---------------------------------------------------------------------------
// 1. Selection policy — deterministic, pre-provider, intent & scope aware
// ---------------------------------------------------------------------------

describe('Phase 3Y: deterministic grounding relevance selection (ADR-222)', () => {
  it('exposes a stable selection policy version', () => {
    expect(GROUNDING_SELECTION_POLICY_VERSION).toBe('1');
  });

  it('portfolio performance intent selects performance/benchmark families, excluding tail risk and scenario', () => {
    const ctx = portfolioContext();
    const r = select(ctx, 'EXPLAIN_PERFORMANCE');
    const cats = categoriesOf(r.selectedFacts);

    expect(cats.has('PERFORMANCE')).toBe(true);
    expect(cats.has('BENCHMARK')).toBe(true);
    expect(cats.has('TAIL_RISK')).toBe(false);
    expect(cats.has('SCENARIO')).toBe(false);
    expect(r.manifest.selectedFactCount).toBeLessThan(r.manifest.availableFactCount);
  });

  it('risk intent selects risk families and excludes scenario', () => {
    const r = select(portfolioContext(), 'EXPLAIN_RISK');
    const cats = categoriesOf(r.selectedFacts);

    expect(cats.has('RISK')).toBe(true);
    expect(cats.has('RISK_ADJUSTED')).toBe(true);
    expect(cats.has('TAIL_RISK')).toBe(true);
    expect(cats.has('SCENARIO')).toBe(false);
  });

  it('benchmark intent selects benchmark evidence without unrelated tail risk', () => {
    const r = select(portfolioContext(), 'EXPLAIN_BENCHMARK');
    const cats = categoriesOf(r.selectedFacts);

    expect(cats.has('BENCHMARK')).toBe(true);
    expect(cats.has('RELATIVE_RISK')).toBe(true);
    expect(cats.has('TAIL_RISK')).toBe(false);
  });

  it('scenario intent selects scenario facts and preserves HYPOTHETICAL nature', () => {
    const r = select(portfolioContext(), 'EXPLAIN_SCENARIO');
    const scenarioFacts = r.selectedFacts.filter((f) => f.category === 'SCENARIO');

    expect(scenarioFacts.length).toBeGreaterThan(0);
    for (const f of scenarioFacts) expect(f.nature).toBe('HYPOTHETICAL');
    expect(categoriesOf(r.selectedFacts).has('TAIL_RISK')).toBe(false);
  });

  it('data quality intent stays minimal', () => {
    const r = select(portfolioContext(), 'EXPLAIN_DATA_QUALITY');
    const cats = categoriesOf(r.selectedFacts);

    expect(cats.has('PERFORMANCE')).toBe(false);
    expect(cats.has('TAIL_RISK')).toBe(false);
    expect(cats.has('SCENARIO')).toBe(false);
  });

  it('asset intent selects asset families, not portfolio tail risk or scenario', () => {
    const r = selectGroundingFacts({ context: assetContext(), intent: 'EXPLAIN_ASSET' });
    const cats = categoriesOf(r.selectedFacts);

    expect(cats.has('ASSET_POSITION')).toBe(true);
    expect(cats.has('TAIL_RISK')).toBe(false);
    expect(cats.has('SCENARIO')).toBe(false);
  });

  it('timeline intent selects event families', () => {
    const r = selectGroundingFacts({ context: timelineContext(10), intent: 'EXPLAIN_TIMELINE' });
    const cats = categoriesOf(r.selectedFacts);

    expect(cats.has('TIMELINE_EVENT')).toBe(true);
    expect(cats.has('EVENT_TRANSACTION')).toBe(true);
  });

  it('asset-scoped selection never selects another asset (3W isolation preserved)', () => {
    const ctx = assetTimelineContext('asset-2', 50);
    const r = selectGroundingFacts({ context: ctx, intent: 'EXPLAIN_TIMELINE' });

    for (const f of r.selectedFacts) {
      if (f.assetId !== undefined) expect(f.assetId).toBe('asset-2');
    }
  });

  it('unknown intent falls back to the broad safe bounded subset, never guessing', () => {
    const r = select(portfolioContext(), 'SOMETHING_NEW' as ExplanationIntent);

    expect(r.manifest.usedFallback).toBe(true);
    expect(r.manifest.selectedFactCount).toBe(r.manifest.availableFactCount);
  });

  it('produces a request-local manifest with available/selected/excluded accounting', () => {
    const r = select(portfolioContext(), 'EXPLAIN_PERFORMANCE');

    expect(r.manifest.policyVersion).toBe('1');
    expect(r.manifest.availableFactCount).toBe(
      r.manifest.selectedFactCount + r.manifest.excludedFactCount,
    );
    expect(r.manifest.excludedCategories.length).toBeGreaterThan(0);
  });

  it('reports answerability instead of silently returning empty grounding', () => {
    const r = select(portfolioContext(), 'EXPLAIN_PERFORMANCE');
    expect(['ANSWERABLE', 'LIMITED', 'UNAVAILABLE']).toContain(r.manifest.answerability);
    expect(r.manifest.answerability).not.toBe('UNAVAILABLE');
  });

  it('selection uses no model, no embeddings and no numeric magnitude ranking', () => {
    const small = portfolioContext([
      currencyInput({
        overview: {
          currentMarketValue: '1',
          positionCount: 1,
          valuedPositionCount: 1,
          unvaluedPositionCount: 0,
          status: 'AVAILABLE',
        },
      }),
    ]);
    const large = portfolioContext([
      currencyInput({
        overview: {
          currentMarketValue: '999999999',
          positionCount: 1,
          valuedPositionCount: 1,
          unvaluedPositionCount: 0,
          status: 'AVAILABLE',
        },
      }),
    ]);

    const a = select(small, 'EXPLAIN_PERFORMANCE');
    const b = select(large, 'EXPLAIN_PERFORMANCE');

    // Identical fact identity selection regardless of monetary magnitude.
    expect(a.selectedFacts.map((f) => f.factId)).toEqual(b.selectedFacts.map((f) => f.factId));
  });
});

// ---------------------------------------------------------------------------
// 2. Determinism
// ---------------------------------------------------------------------------

describe('Phase 3Y: determinism', () => {
  it('same question/intent/scope/grounding yields identical selection and identical bytes', () => {
    const ctx = timelineContext(50);
    const first = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const firstIds = first.selection.selectedFacts.map((f) => f.factId);
    const firstBytes = bytes(first.messages);

    for (let i = 0; i < 50; i++) {
      const again = compact(ctx as never, 'EXPLAIN_TIMELINE');
      expect(again.selection.selectedFacts.map((f) => f.factId)).toEqual(firstIds);
      expect(bytes(again.messages)).toBe(firstBytes);
    }
  });

  it('no ordering drift across 1000 repeated executions', () => {
    const ctx = portfolioContext();
    const baseline = select(ctx, 'EXPLAIN_RISK')
      .selectedFacts.map((f) => f.factId)
      .join('|');

    for (let i = 0; i < 1000; i++) {
      expect(
        select(ctx, 'EXPLAIN_RISK')
          .selectedFacts.map((f) => f.factId)
          .join('|'),
      ).toBe(baseline);
    }
  });

  it('alias assignment is stable and collision-free within a request', () => {
    const ctx = timelineContext(50);
    const a = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const b = compact(ctx as never, 'EXPLAIN_TIMELINE');

    expect([...a.projection.aliases.aliasToFactId.entries()]).toEqual([
      ...b.projection.aliases.aliasToFactId.entries(),
    ]);
    const aliases = [...a.projection.aliases.aliasToFactId.keys()];
    expect(new Set(aliases).size).toBe(aliases.length);
    const factIds = [...a.projection.aliases.aliasToFactId.values()];
    expect(new Set(factIds).size).toBe(factIds.length);
  });
});

// ---------------------------------------------------------------------------
// 3. Excluded facts are not authoritative (ADR-227) — critical
// ---------------------------------------------------------------------------

describe('Phase 3Y: excluded facts cannot become authority (ADR-227)', () => {
  function authoritative(context: never, intent: ExplanationIntent) {
    const r = buildCompactConversationPrompt(context, Q, intent, []);
    return { ...(context as object), facts: r.selection.selectedFacts } as never;
  }

  it('a tail-risk fact excluded by a performance-intent turn is rejected as evidence', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const excluded = ctx.facts.find((f) => f.category === 'TAIL_RISK');

    expect(excluded).toBeDefined();
    expect(r.selection.canonicalFactRegistry.has(excluded!.factId)).toBe(false);

    const validation = validateExplanationEvidence(
      [excluded!.factId],
      authoritative(ctx as never, 'EXPLAIN_PERFORMANCE'),
    );
    expect(validation.valid).toBe(false);
    expect(validation.unknownFactIds).toContain(excluded!.factId);
  });

  it('a claim citing an excluded fact fails validation against the selected authority', () => {
    const ctx = portfolioContext();
    const excluded = ctx.facts.find((f) => f.category === 'SCENARIO')!;

    const claims: GroundedClaimInput[] = [
      {
        type: 'SCENARIO_EXPLANATION',
        segments: [
          { type: 'TEXT', text: 'Impacto estimado no cenario: ' },
          { type: 'FACT_VALUE', factId: excluded.factId },
        ],
      },
    ];

    const result = validateGroundedClaims(
      claims,
      authoritative(ctx as never, 'EXPLAIN_PERFORMANCE'),
    );
    expect(result.valid).toBe(false);
  });

  it('an entirely invented fact reference is rejected', () => {
    const ctx = portfolioContext();
    const validation = validateExplanationEvidence(
      ['BRL.PERFORMANCE.TOTALLY_INVENTED'],
      authoritative(ctx as never, 'EXPLAIN_PERFORMANCE'),
    );
    expect(validation.valid).toBe(false);
  });

  it('a selected fact IS accepted as evidence', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const selected = r.selection.selectedFacts[0]!;

    const validation = validateExplanationEvidence(
      [selected.factId],
      authoritative(ctx as never, 'EXPLAIN_PERFORMANCE'),
    );
    expect(validation.valid).toBe(true);
    expect(validation.resolvedEvidence[0]!.factId).toBe(selected.factId);
  });
});

// ---------------------------------------------------------------------------
// 4. Alias resolution (ADR-224)
// ---------------------------------------------------------------------------

describe('Phase 3Y: request-local evidence aliases (ADR-224)', () => {
  it('provider-facing refs resolve back to canonical fact IDs', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const [alias, canonical] = [...r.projection.aliases.aliasToFactId.entries()][0]!;

    expect(alias).toMatch(/^F\d+$/);
    expect(resolveEvidenceReference(alias, r.projection.aliases)).toBe(canonical);
    expect(r.selection.canonicalFactRegistry.has(canonical)).toBe(true);
  });

  it('canonical fact IDs remain accepted references (no hard contract break)', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const canonical = r.selection.selectedFacts[0]!.factId;

    expect(resolveEvidenceReference(canonical, r.projection.aliases)).toBe(canonical);
  });

  it('unknown references are passed through untouched so fail-closed validation rejects them', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');

    expect(resolveEvidenceReference('F99999', r.projection.aliases)).toBe('F99999');
    expect(resolveEvidenceReferences(['F99999'], r.projection.aliases)).toEqual(['F99999']);
  });

  it('claim segments are rewritten to canonical identity for persistence', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const [alias, canonical] = [...r.projection.aliases.aliasToFactId.entries()][0]!;

    const resolved = resolveClaimReferences(
      [
        {
          type: 'FACTUAL_METRIC',
          segments: [{ type: 'FACT_VALUE', factId: alias }],
          factIds: [alias],
        },
      ],
      r.projection.aliases,
    );

    expect(resolved[0]!.segments[0]!.factId).toBe(canonical);
    expect(resolved[0]!.factIds).toEqual([canonical]);
    expect(canonical).not.toMatch(/^F\d+$/);
  });
});

// ---------------------------------------------------------------------------
// 5. Compaction preserves financial semantics
// ---------------------------------------------------------------------------

describe('Phase 3Y: compaction never mutates financial semantics', () => {
  it('preserves exact decimal strings without rounding or reformatting', () => {
    const exact = ['3.999999999999999999', '12345.678901234567890123'];
    const events = makeEvents(2).map((e, i) => ({
      ...e,
      quantity: exact[i]!,
      moneyAmount: exact[i]!,
    }));
    const ctx = timelineContext(2, events);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const serialized = r.user;

    for (const value of exact) expect(serialized).toContain(value);
    expect(serialized).not.toContain('3.999999999999999998');
    expect(serialized).not.toContain('12345.68');
  });

  it('preserves currency on every monetary fact', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const rows = (r.projection.payload as { facts: { u: string; cur?: string }[] }).facts;

    for (const row of rows) {
      if (row.u === 'MONEY') expect(row.cur).toBeDefined();
    }
  });

  it('preserves nature on every projected fact', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_SCENARIO');
    const rows = (r.projection.payload as { facts: { n: string }[] }).facts;

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['CURRENT', 'HISTORICAL', 'HYPOTHETICAL', 'POINT_IN_TIME', 'PERIOD']).toContain(row.n);
    }
  });

  it('preserves availability status so unknown is never rendered as zero', () => {
    const ctx = assetContext({ ...PETR4, averageCost: null, costBasis: null });
    const r = compact(ctx as never, 'EXPLAIN_ASSET');
    const rows = (r.projection.payload as { facts: { m: string; v: string | null; st: string }[] })
      .facts;
    const unknown = rows.filter((row) => row.v === null);

    expect(unknown.length).toBeGreaterThan(0);
    for (const row of unknown) {
      expect(row.v).toBeNull();
      expect(row.v).not.toBe('0');
      expect(row.st).toBeDefined();
    }
  });

  it('does not merge BUY and SELL event types', () => {
    const ctx = timelineContext(10);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const events = (r.projection.payload as { events: { t: string }[] }).events;
    const types = new Set(events.map((e) => e.t));

    expect(types.has('BUY')).toBe(true);
    expect(types.has('SELL')).toBe(true);
  });

  it('does not merge DIVIDEND and JCP event types', () => {
    const events = [
      { ...makeEvents(1)[0]!, eventId: 'e-div', eventType: 'DIVIDEND' as const },
      { ...makeEvents(1)[0]!, eventId: 'e-jcp', eventType: 'JCP' as const },
    ];
    const ctx = timelineContext(2, events);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const projected = (r.projection.payload as { events: { t: string }[] }).events;
    const types = new Set(projected.map((e) => e.t));

    expect(types.has('DIVIDEND')).toBe(true);
    expect(types.has('JCP')).toBe(true);
  });

  it('does not merge BUY and TRANSFER_IN event types', () => {
    const events = [
      { ...makeEvents(1)[0]!, eventId: 'e-buy', eventType: 'BUY' as const },
      { ...makeEvents(1)[0]!, eventId: 'e-tin', eventType: 'TRANSFER_IN' as const },
    ];
    const ctx = timelineContext(2, events);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const projected = (r.projection.payload as { events: { t: string }[] }).events;

    expect(new Set(projected.map((e) => e.t))).toEqual(new Set(['BUY', 'TRANSFER_IN']));
  });

  it('keeps multi-currency facts segregated without FX merging', () => {
    const ctx = portfolioContext([currencyInput(), currencyInput({ currency: 'USD' })]);
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');
    const rows = (r.projection.payload as { facts: { s: string; cur?: string }[] }).facts;
    const scopes = new Set(rows.map((row) => row.s));

    expect(scopes.has('BRL')).toBe(true);
    expect(scopes.has('USD')).toBe(true);
    expect(r.projection.payload).toMatchObject({
      currencies: expect.arrayContaining(['BRL', 'USD']),
    });
  });

  it('keeps AssetId canonical while symbol stays display metadata', () => {
    const ctx = timelineContext(10);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const assets = (r.projection.payload as { assets: Record<string, { assetId: string }> }).assets;

    expect(Object.keys(assets).length).toBeGreaterThan(0);
    for (const entry of Object.values(assets)) expect(entry.assetId).toMatch(/^asset-/);
  });

  it('preserves the PARTIAL_TIMELINE_EVENTS limitation under compaction', () => {
    const ctx = timelineContext(5000);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const payload = r.projection.payload as {
      limitations: { code: string }[];
      timeline: { hasMore: boolean };
    };

    expect(payload.limitations.map((l) => l.code)).toContain('PARTIAL_TIMELINE_EVENTS');
    expect(payload.timeline.hasMore).toBe(true);
  });

  it('preserves the EMPTY_TIMELINE_PERIOD limitation under compaction', () => {
    const ctx = timelineContext(0, []);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const payload = r.projection.payload as { limitations: { code: string }[] };

    expect(payload.limitations.map((l) => l.code)).toContain('EMPTY_TIMELINE_PERIOD');
  });

  it('never leaks internal validator source metadata to the provider', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');

    expect(r.user).not.toContain('PORTFOLIO_INTELLIGENCE_SUMMARY_V1');
    expect(r.user).not.toContain('"source"');
  });

  it('retains every safety directive from the canonical policy', () => {
    const ctx = portfolioContext();
    const r = compact(ctx as never, 'EXPLAIN_PERFORMANCE');

    expect(r.system).toContain(PORTFOLIO_AI_CONVERSATION_POLICY_V1);
    expect(r.system).toContain(COMPACT_CONTEXT_FORMAT_ADDENDUM);
    expect(r.system).toContain('PROIBIÇÃO DE RECOMENDAÇÃO');
    expect(r.system).toContain('PROIBIÇÃO DE PREVISÃO');
    expect(r.system).toContain('PROIBIÇÃO DE RECÁLCULO FINANCEIRO');
    expect(r.system).toContain('ISOLAMENTO CAMBIAL');
  });
});

// ---------------------------------------------------------------------------
// 6. Context efficiency
// ---------------------------------------------------------------------------

describe('Phase 3Y: context efficiency', () => {
  const cases: { label: string; ctx: () => unknown; intent: ExplanationIntent }[] = [
    {
      label: 'portfolio-performance',
      ctx: () => portfolioContext(),
      intent: 'EXPLAIN_PERFORMANCE',
    },
    { label: 'portfolio-risk', ctx: () => portfolioContext(), intent: 'EXPLAIN_RISK' },
    { label: 'asset-average-cost', ctx: () => assetContext(), intent: 'EXPLAIN_ASSET' },
    { label: 'timeline-10', ctx: () => timelineContext(10), intent: 'EXPLAIN_TIMELINE' },
    { label: 'timeline-15', ctx: () => timelineContext(15), intent: 'EXPLAIN_TIMELINE' },
    { label: 'timeline-50', ctx: () => timelineContext(50), intent: 'EXPLAIN_TIMELINE' },
  ];

  for (const c of cases) {
    it(`${c.label}: compaction reduces bytes without losing selected authority`, () => {
      const ctx = c.ctx() as never;
      const before = bytes(buildConversationPrompt(ctx, Q, c.intent, []).messages);
      const r = buildCompactConversationPrompt(ctx, Q, c.intent, []);
      const after = bytes(r.messages);

      expect(after).toBeLessThan(before);
      expect(r.selection.selectedFacts.length).toBeGreaterThan(0);
    });
  }

  it('10-event timeline fits the budget', () => {
    const r = compact(timelineContext(10) as never, 'EXPLAIN_TIMELINE');
    expect(bytes(r.messages)).toBeLessThanOrEqual(AI_DEFAULT_MAX_CONTEXT_BYTES);
  });

  it('15-event timeline now fits the budget after deterministic selection', () => {
    const ctx = timelineContext(15);
    const before = bytes(buildConversationPrompt(ctx, Q, 'EXPLAIN_TIMELINE', []).messages);
    const after = bytes(compact(ctx as never, 'EXPLAIN_TIMELINE').messages);

    expect(before).toBeGreaterThan(AI_DEFAULT_MAX_CONTEXT_BYTES);
    expect(after).toBeLessThanOrEqual(AI_DEFAULT_MAX_CONTEXT_BYTES);
  });

  it('50-event targeted timeline fits the budget with the event cap intact', () => {
    const ctx = timelineContext(5000);
    const r = compact(
      ctx as never,
      'EXPLAIN_TIMELINE',
      'Quais foram minhas ultimas compras neste periodo?',
    );

    expect(ctx.events.length).toBe(MAX_AI_TIMELINE_EVENTS);
    expect(bytes(r.messages)).toBeLessThanOrEqual(AI_DEFAULT_MAX_CONTEXT_BYTES);
  });

  it('event cap remains 50 and is independent of the final byte budget', () => {
    expect(MAX_AI_TIMELINE_EVENTS).toBe(50);
    expect(timelineContext(50).events.length).toBe(50);
    expect(timelineContext(51).events.length).toBe(50);
    expect(timelineContext(5000).events.length).toBe(50);
    expect(timelineContext(51).summaryFacts.hasMore).toBe(true);
    expect(timelineContext(50).summaryFacts.hasMore).toBe(false);
  });

  it('deduplicates repeated asset metadata into one dictionary entry per asset', () => {
    const ctx = timelineContext(50);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const payload = r.projection.payload as {
      assets: Record<string, unknown>;
      events: unknown[];
    };

    // 50 events across 5 distinct assets -> exactly 5 dictionary entries.
    expect(payload.events.length).toBe(50);
    expect(Object.keys(payload.assets).length).toBe(5);
  });

  it('carries event metadata once instead of repeating it across six fact objects', () => {
    const ctx = timelineContext(50);
    const r = compact(ctx as never, 'EXPLAIN_TIMELINE');
    const payload = r.projection.payload as { events: { id: string }[]; facts: unknown[] };

    // Event facts are represented by the envelope, not as 6 separate rows each.
    expect(payload.events.length).toBe(50);
    expect(payload.facts.length).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// 7. Budget enforcement after compaction (ADR-225)
// ---------------------------------------------------------------------------

describe('Phase 3Y: budget measured after compaction (ADR-225)', () => {
  it('the hard limit remains exactly 32768', () => {
    expect(AI_DEFAULT_MAX_CONTEXT_BYTES).toBe(32768);
  });

  it('measures UTF-8 bytes correctly for accented Portuguese text', () => {
    const question = 'ação posição São Paulo';
    expect(Buffer.byteLength(question, 'utf8')).toBeGreaterThan(question.length);

    const r = compact(portfolioContext() as never, 'EXPLAIN_PERFORMANCE', question);
    expect(bytes(r.messages)).toBe(Buffer.byteLength(JSON.stringify(r.messages), 'utf8'));
  });

  it('classifies budget utilization into bounded low-cardinality buckets', () => {
    expect(classifyBudgetUtilization(0)).toBe('LT_25');
    expect(classifyBudgetUtilization(16384)).toBe('50_75');
    expect(classifyBudgetUtilization(32768)).toBe('90_100');
    expect(classifyBudgetUtilization(32769)).toBe('OVER');

    for (const bucket of AI_BUDGET_UTILIZATION_BUCKETS) {
      expect(typeof bucket).toBe('string');
    }
  });

  it('bucket labels never contain fact IDs or raw identifiers', () => {
    for (const bucket of AI_BUDGET_UTILIZATION_BUCKETS) {
      expect(bucket).not.toMatch(/asset|portfolio|user|EVENT:|BRL\./i);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Selector performance (§97, §98)
// ---------------------------------------------------------------------------

describe('Phase 3Y: selector performance is linear and bounded', () => {
  it('runs in linear time over available facts up to 5000 events', () => {
    for (const n of [30, 100, 500, 2000, 5000]) {
      const ctx = timelineContext(n);
      const t0 = performance.now();
      const r = selectGroundingFacts({ context: ctx, intent: 'EXPLAIN_TIMELINE' });
      const elapsed = performance.now() - t0;

      expect(r.manifest.availableFactCount).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(500);
    }
  });

  it('projection builds without duplicating the whole grounding object', () => {
    const ctx = timelineContext(5000);
    const selection = selectGroundingFacts({ context: ctx, intent: 'EXPLAIN_TIMELINE' });
    const projection = buildProviderProjection({
      context: ctx,
      selection,
      question: Q,
      intent: 'EXPLAIN_TIMELINE',
    });

    expect(Object.isFrozen(projection.payload)).toBe(true);
    expect(projection.aliases.aliasToFactId.size).toBeGreaterThan(0);
  });
});
