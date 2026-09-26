import { describe, it, expect } from 'vitest';
import {
  buildPortfolioTimelineAiGroundingContext,
  PortfolioAiEventV1,
  classifyConversationIntent,
  validateGroundedClaims,
  renderValidatedClaims,
  GroundedClaimInput,
  MAX_AI_TIMELINE_EVENTS,
} from '@atlas/ai-engine';

describe('Phase 3X: AI Timeline Grounding Unit Tests', () => {
  const sampleEvents: PortfolioAiEventV1[] = [
    {
      eventId: 'tx_buy_1',
      eventType: 'BUY',
      economicDate: '2026-09-01',
      assetId: 'asset-petr4',
      symbol: 'PETR4',
      assetName: 'Petróleo Brasileiro S.A.',
      quantity: '100',
      moneyAmount: '3550.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'tx_buy_2',
      eventType: 'BUY',
      economicDate: '2026-09-10',
      assetId: 'asset-vale3',
      symbol: 'VALE3',
      assetName: 'Vale S.A.',
      quantity: '50',
      moneyAmount: '3000.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'tx_sell_1',
      eventType: 'SELL',
      economicDate: '2026-09-15',
      assetId: 'asset-petr4',
      symbol: 'PETR4',
      assetName: 'Petróleo Brasileiro S.A.',
      quantity: '30',
      moneyAmount: '1140.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'inc_div_1',
      eventType: 'DIVIDEND',
      economicDate: '2026-09-20',
      assetId: 'asset-petr4',
      symbol: 'PETR4',
      assetName: 'Petróleo Brasileiro S.A.',
      moneyAmount: '45.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'inc_jcp_1',
      eventType: 'JCP',
      economicDate: '2026-09-22',
      assetId: 'asset-vale3',
      symbol: 'VALE3',
      assetName: 'Vale S.A.',
      moneyAmount: '25.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'cf_dep_1',
      eventType: 'CASH_DEPOSIT',
      economicDate: '2026-08-30', // Before period
      moneyAmount: '10000.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'ca_split_1',
      eventType: 'SPLIT',
      economicDate: '2026-09-25',
      assetId: 'asset-vale3',
      symbol: 'VALE3',
      assetName: 'Vale S.A.',
      quantity: '100',
      nature: 'HISTORICAL',
    },
    {
      eventId: 'tr_in_1',
      eventType: 'TRANSFER_IN',
      economicDate: '2026-09-28',
      assetId: 'asset-itub4',
      symbol: 'ITUB4',
      assetName: 'Itaú Unibanco',
      quantity: '200',
      moneyAmount: '6000.00',
      currency: 'BRL',
      nature: 'HISTORICAL',
    },
  ];

  it('builds canonical timeline context with date filtering and chronological ordering in facts', () => {
    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-09-01', to: '2026-09-30' },
      scope: { type: 'TIMELINE', from: '2026-09-01', to: '2026-09-30' },
      candidateEvents: sampleEvents,
    });

    expect(context.schemaVersion).toBe('1.0');
    expect(context.portfolioId).toBe('port-1');
    expect(context.period.from).toBe('2026-09-01');
    expect(context.period.to).toBe('2026-09-30');
    expect(context.scope.type).toBe('TIMELINE');

    // 'cf_dep_1' (2026-08-30) should be excluded
    expect(context.events).toHaveLength(7);
    expect(context.events.find((e) => e.eventId === 'cf_dep_1')).toBeUndefined();

    // Chronological ordering check
    for (let i = 1; i < context.events.length; i++) {
      const prev = context.events[i - 1]!;
      const curr = context.events[i]!;
      expect(prev.economicDate.localeCompare(curr.economicDate)).toBeLessThanOrEqual(0);
    }

    // HasMore should be false for 7 events
    expect(context.summaryFacts.hasMore).toBe(false);
    expect(context.eventLimitReached).toBe(false);
    expect(context.limitations).toHaveLength(0);

    // Deep freeze
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.events)).toBe(true);
    expect(Object.isFrozen(context.facts)).toBe(true);
  });

  it('isolates asset under ASSET_TIMELINE scope with strict anti-bleed', () => {
    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-09-01', to: '2026-09-30' },
      scope: {
        type: 'ASSET_TIMELINE',
        assetId: 'asset-petr4',
        symbol: 'PETR4',
        from: '2026-09-01',
        to: '2026-09-30',
      },
      candidateEvents: sampleEvents,
    });

    expect(context.scope.type).toBe('ASSET_TIMELINE');
    expect(context.events.every((e) => e.assetId === 'asset-petr4')).toBe(true);
    expect(context.events).toHaveLength(3); // buy_1, sell_1, div_1
    expect(context.events.map((e) => e.eventId)).toEqual(['tx_buy_1', 'tx_sell_1', 'inc_div_1']);
  });

  it('strictly bounds event count to MAX_AI_TIMELINE_EVENTS (50) and discloses limitation', () => {
    // Generate 60 synthetic events
    const manyEvents: PortfolioAiEventV1[] = [];
    for (let i = 1; i <= 60; i++) {
      const dayStr = i <= 30 ? String(i).padStart(2, '0') : String(i - 30).padStart(2, '0');
      const monthStr = i <= 30 ? '08' : '09';
      manyEvents.push({
        eventId: `tx_seq_${i}`,
        eventType: 'BUY',
        economicDate: `2026-${monthStr}-${dayStr}`,
        assetId: 'asset-petr4',
        quantity: '10',
        moneyAmount: '100.00',
        currency: 'BRL',
        nature: 'HISTORICAL',
      });
    }

    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-08-01', to: '2026-09-30' },
      scope: { type: 'TIMELINE', from: '2026-08-01', to: '2026-09-30' },
      candidateEvents: manyEvents,
    });

    expect(context.events).toHaveLength(MAX_AI_TIMELINE_EVENTS);
    expect(context.summaryFacts.hasMore).toBe(true);
    expect(context.eventLimitReached).toBe(true);
    expect(context.summaryFacts.totalMatchingEvents).toBe(60);
    expect(context.limitations.some((l) => l.code === 'PARTIAL_TIMELINE_EVENTS')).toBe(true);

    // Prioritizes 50 most recent: events 11 to 60 should be selected, event 1 (earliest) excluded
    expect(context.events.find((e) => e.eventId === 'tx_seq_1')).toBeUndefined();
    expect(context.events.find((e) => e.eventId === 'tx_seq_60')).toBeDefined();
  });

  it('handles empty timeline periods gracefully without failure', () => {
    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-01-01', to: '2026-01-31' },
      scope: { type: 'TIMELINE', from: '2026-01-01', to: '2026-01-31' },
      candidateEvents: sampleEvents,
    });

    expect(context.events).toHaveLength(0);
    expect(context.summaryFacts.eventCountIncluded).toBe(0);
    expect(context.summaryFacts.hasMore).toBe(false);
    expect(context.limitations.some((l) => l.code === 'EMPTY_TIMELINE_PERIOD')).toBe(true);

    // Summary facts still present
    const eventCountFact = context.facts.find((f) => f.factId === 'TIMELINE:EVENT_COUNT');
    expect(eventCountFact).toBeDefined();
    expect(eventCountFact?.value).toBe('0');
  });

  it('extracts event facts with exact decimal strings and correct metric categories', () => {
    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-09-01', to: '2026-09-30' },
      scope: { type: 'TIMELINE', from: '2026-09-01', to: '2026-09-30' },
      candidateEvents: sampleEvents,
    });

    const buyFactType = context.facts.find((f) => f.factId === 'EVENT:tx_buy_1.TYPE');
    expect(buyFactType?.value).toBe('BUY');
    expect(buyFactType?.category).toBe('EVENT_TRANSACTION');

    const buyFactQty = context.facts.find((f) => f.factId === 'EVENT:tx_buy_1.QUANTITY');
    expect(buyFactQty?.value).toBe('100');
    expect(buyFactQty?.unit).toBe('QUANTITY');

    const buyFactAmount = context.facts.find((f) => f.factId === 'EVENT:tx_buy_1.AMOUNT');
    expect(buyFactAmount?.value).toBe('3550.00');
    expect(buyFactAmount?.unit).toBe('MONEY');

    const divFact = context.facts.find((f) => f.factId === 'EVENT:inc_div_1.TYPE');
    expect(divFact?.value).toBe('DIVIDEND');
    expect(divFact?.category).toBe('EVENT_INCOME');

    const jcpFact = context.facts.find((f) => f.factId === 'EVENT:inc_jcp_1.TYPE');
    expect(jcpFact?.value).toBe('JCP');
    expect(jcpFact?.category).toBe('EVENT_INCOME');
  });

  it('classifies historical inquiries as EXPLAIN_TIMELINE and rejects recommendations/predictions', () => {
    const histRes1 = classifyConversationIntent(
      'Qual foi minha última compra de ações no período?',
      [],
      { type: 'TIMELINE', from: '2026-09-01', to: '2026-09-30' },
    );
    expect(histRes1.intent).toBe('EXPLAIN_TIMELINE');

    const histRes2 = classifyConversationIntent('Quais proventos recebi em setembro?', [], {
      type: 'TIMELINE',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(histRes2.intent).toBe('EXPLAIN_TIMELINE');

    // Real recommendations must remain strictly rejected upstream
    const recRes = classifyConversationIntent('Devo comprar mais PETR4 agora?', [], {
      type: 'TIMELINE',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(recRes.intent).toBe('UNSUPPORTED_RECOMMENDATION');

    const predRes = classifyConversationIntent('Quanto as ações vão render no próximo mês?', [], {
      type: 'TIMELINE',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(predRes.intent).toBe('UNSUPPORTED_PREDICTION');
  });

  it('validates and server-renders claims citing event facts with exact decimal strings', () => {
    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-09-01', to: '2026-09-30' },
      scope: { type: 'TIMELINE', from: '2026-09-01', to: '2026-09-30' },
      candidateEvents: sampleEvents,
    });

    const claims: GroundedClaimInput[] = [
      {
        claimId: 'claim-1',
        type: 'FACTUAL_METRIC',
        factIds: ['EVENT:tx_buy_1.QUANTITY', 'EVENT:tx_buy_1.AMOUNT'],
        segments: [
          { type: 'TEXT', text: 'Você realizou uma compra de ' },
          { type: 'FACT_VALUE', factId: 'EVENT:tx_buy_1.QUANTITY' },
          { type: 'TEXT', text: ' ações por um total de ' },
          { type: 'FACT_VALUE', factId: 'EVENT:tx_buy_1.AMOUNT' },
          { type: 'TEXT', text: '.' },
        ],
      },
    ];

    const validation = validateGroundedClaims(claims, context);
    expect(validation.valid).toBe(true);

    const rendered = renderValidatedClaims(validation.validatedClaims);
    expect(rendered).toBe('Você realizou uma compra de 100 ações por um total de BRL 3.550,00.');
  });

  it('rejects claims citing events from another asset under ASSET_TIMELINE scope', () => {
    const context = buildPortfolioTimelineAiGroundingContext({
      portfolioId: 'port-1',
      period: { from: '2026-09-01', to: '2026-09-30' },
      scope: {
        type: 'ASSET_TIMELINE',
        assetId: 'asset-petr4',
        symbol: 'PETR4',
        from: '2026-09-01',
        to: '2026-09-30',
      },
      candidateEvents: sampleEvents,
    });

    const claims: GroundedClaimInput[] = [
      {
        claimId: 'claim-cross',
        type: 'FACTUAL_METRIC',
        factIds: ['EVENT:tx_buy_2.AMOUNT'], // VALE3 event
        segments: [
          { type: 'TEXT', text: 'Houve compra de ' },
          { type: 'FACT_VALUE', factId: 'EVENT:tx_buy_2.AMOUNT' },
        ],
      },
    ];

    const validation = validateGroundedClaims(claims, context, { targetAssetId: 'asset-petr4' });
    expect(validation.valid).toBe(false);
  });
});
