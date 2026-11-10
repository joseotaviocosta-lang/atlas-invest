import { describe, it, expect } from 'vitest';
import {
  OpportunityRadarEngine,
  OpportunityAssetInput,
  OPPORTUNITY_MODEL_VERSION,
  FiiDividendCalendarEvent,
  calculateDividendEligibility,
  calculateDividendCalendarFit,
  detectReinvestmentChains,
  FiiOpportunityScorer,
  formatIsoDateString,
  isValidIsoDateString,
  normalizeDividendEvent,
  sortDividendEvents,
  selectRelevantDividendEvent,
} from '@atlas/market-data';

describe('PROJECT ATLAS — APP-16I: FII Dividend Calendar & Reinvestment Strategy', () => {
  const refDateStr = '2026-11-10';
  const refDate = new Date(`${refDateStr}T12:00:00.000Z`);

  const mockFii = (
    ticker: string,
    opts: {
      weight?: number;
      pvp?: number;
      dy?: number;
      dailyChange?: number;
      calendar?: Partial<FiiDividendCalendarEvent>;
    } = {},
  ): OpportunityAssetInput => ({
    assetId: `fii-${ticker}`,
    ticker,
    name: `Fundo Imobiliário ${ticker}`,
    assetType: 'FII',
    currency: 'BRL',
    quantity: '100',
    marketValue: '10000',
    portfolioWeight: opts.weight ?? 3.5,
    classWeight: 15.0,
    currentPrice: '100.00',
    dailyChangePercent: opts.dailyChange ?? 0.2,
    change5dPercent: 0.8,
    change21dPercent: 2.5,
    change63dPercent: 4.0,
    fiftyTwoWeekHigh: 110.0,
    fiftyTwoWeekLow: 90.0,
    fiiPriceToBook: opts.pvp ?? 0.95,
    fiiDividendYield: opts.dy ?? 10.5,
    fiiSegment: 'Logística',
    recentNews: [
      {
        id: `news-${ticker}`,
        headline: `${ticker} anuncia distribuição de rendimentos mensais`,
        source: 'B3',
        publishedAt: refDate.toISOString(),
        sentiment: 'POSITIVE',
        relevance: 0.8,
      },
    ],
    dividendCalendar: opts.calendar
      ? {
          ticker,
          recordDate: opts.calendar.recordDate ?? '2026-11-15',
          exDate: opts.calendar.exDate ?? '2026-11-16',
          paymentDate: opts.calendar.paymentDate ?? '2026-11-25',
          amountPerShare: opts.calendar.amountPerShare ?? 1.1,
          eventStatus: opts.calendar.eventStatus ?? 'ANNOUNCED',
          source: opts.calendar.source ?? 'BRAPI_DIVIDENDS',
          announcedAt: opts.calendar.announcedAt ?? '2026-10-31',
          eligibilityStatus: opts.calendar.eligibilityStatus ?? 'UNKNOWN',
          daysUntilRecordDate: opts.calendar.daysUntilRecordDate ?? null,
          daysUntilPayment: opts.calendar.daysUntilPayment ?? null,
          sameMonthReinvestmentCandidate: opts.calendar.sameMonthReinvestmentCandidate,
        }
      : undefined,
  });

  // 1. calculateDividendEligibility tests
  it('1. calculates ELIGIBLE when referenceDate < recordDate', () => {
    const res = calculateDividendEligibility('2026-11-15', '2026-11-10');
    expect(res.eligibilityStatus).toBe('ELIGIBLE');
    expect(res.daysUntilRecordDate).toBe(5);
  });

  it('2. calculates RECORD_DATE_TODAY when referenceDate === recordDate', () => {
    const res = calculateDividendEligibility('2026-11-10', '2026-11-10');
    expect(res.eligibilityStatus).toBe('RECORD_DATE_TODAY');
    expect(res.daysUntilRecordDate).toBe(0);
  });

  it('3. calculates EX_DIVIDEND when referenceDate > recordDate (Strict Entitlement Invariant)', () => {
    // Even though paymentDate is in the future, if recordDate was yesterday, buyer is EX_DIVIDEND
    const res = calculateDividendEligibility('2026-11-09', '2026-11-10');
    expect(res.eligibilityStatus).toBe('EX_DIVIDEND');
    expect(res.daysUntilRecordDate).toBe(-1);
  });

  it('4. calculates UNKNOWN when recordDate is null', () => {
    const res = calculateDividendEligibility(null, '2026-11-10');
    expect(res.eligibilityStatus).toBe('UNKNOWN');
    expect(res.daysUntilRecordDate).toBeNull();
  });

  // 5. calculateDividendCalendarFit tests
  it('5. returns null when dividend calendar strategy is disabled or data is UNKNOWN', () => {
    const fitDisabled = calculateDividendCalendarFit(
      {
        ticker: 'HGLG11',
        recordDate: '2026-11-15',
        exDate: '2026-11-16',
        paymentDate: '2026-11-25',
        amountPerShare: 1.1,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 5,
        daysUntilPayment: 15,
      },
      false, // disabled
    );
    expect(fitDisabled).toBeNull();

    const fitUnknown = calculateDividendCalendarFit({
      ticker: 'HGLG11',
      recordDate: null,
      exDate: null,
      paymentDate: null,
      amountPerShare: null,
      eventStatus: 'UNKNOWN',
      source: 'BRAPI',
      eligibilityStatus: 'UNKNOWN',
      daysUntilRecordDate: null,
      daysUntilPayment: null,
    });
    expect(fitUnknown).toBeNull();
  });

  it('6. returns 55 for HISTORICAL_PATTERN event status', () => {
    const fit = calculateDividendCalendarFit({
      ticker: 'HGLG11',
      recordDate: '2026-11-15',
      exDate: '2026-11-16',
      paymentDate: '2026-11-25',
      amountPerShare: 1.1,
      eventStatus: 'HISTORICAL_PATTERN',
      source: 'HISTORICAL',
      eligibilityStatus: 'ELIGIBLE',
      daysUntilRecordDate: 5,
      daysUntilPayment: 15,
    });
    expect(fit).toBe(55);
  });

  it('7. returns tiered actionable scores for ANNOUNCED + ELIGIBLE events', () => {
    const eventBase: FiiDividendCalendarEvent = {
      ticker: 'HGLG11',
      recordDate: '2026-11-15',
      exDate: '2026-11-16',
      paymentDate: '2026-11-25',
      amountPerShare: 1.1,
      eventStatus: 'ANNOUNCED',
      source: 'BRAPI',
      eligibilityStatus: 'ELIGIBLE',
      daysUntilRecordDate: 3,
      daysUntilPayment: 15,
    };

    // 1 to 5 days: 95
    expect(calculateDividendCalendarFit({ ...eventBase, daysUntilRecordDate: 3 })).toBe(95);

    // 6 to 12 days: 85
    expect(calculateDividendCalendarFit({ ...eventBase, daysUntilRecordDate: 8 })).toBe(85);

    // 13 to 25 days: 75
    expect(calculateDividendCalendarFit({ ...eventBase, daysUntilRecordDate: 18 })).toBe(75);

    // > 25 days: 65
    expect(calculateDividendCalendarFit({ ...eventBase, daysUntilRecordDate: 30 })).toBe(65);

    // Reinvestment bonus (+5, capped at 100)
    expect(
      calculateDividendCalendarFit({
        ...eventBase,
        daysUntilRecordDate: 3,
        sameMonthReinvestmentCandidate: true,
      }),
    ).toBe(100);
  });

  it('8. returns 80 for RECORD_DATE_TODAY and 25 for EX_DIVIDEND', () => {
    const todayEvent: FiiDividendCalendarEvent = {
      ticker: 'HGLG11',
      recordDate: '2026-11-10',
      exDate: '2026-11-11',
      paymentDate: '2026-11-20',
      amountPerShare: 1.1,
      eventStatus: 'ANNOUNCED',
      source: 'BRAPI',
      eligibilityStatus: 'RECORD_DATE_TODAY',
      daysUntilRecordDate: 0,
      daysUntilPayment: 10,
    };
    expect(calculateDividendCalendarFit(todayEvent)).toBe(80);

    const exEvent: FiiDividendCalendarEvent = {
      ...todayEvent,
      recordDate: '2026-11-05',
      eligibilityStatus: 'EX_DIVIDEND',
      daysUntilRecordDate: -5,
    };
    expect(calculateDividendCalendarFit(exEvent)).toBe(25);
  });

  // 9. Reinvestment chains detection
  it('9. detects cross-FII reinvestment chains when source paymentDate <= target recordDate', () => {
    const events: FiiDividendCalendarEvent[] = [
      {
        ticker: 'HGLG11',
        recordDate: '2026-10-31',
        exDate: '2026-11-03',
        paymentDate: '2026-11-14', // pays on 14th
        amountPerShare: 1.1,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -10,
        daysUntilPayment: 4,
      },
      {
        ticker: 'KNRI11',
        recordDate: '2026-11-18', // record date on 18th (after HGLG pays)
        exDate: '2026-11-19',
        paymentDate: '2026-11-28',
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 8,
        daysUntilPayment: 18,
      },
    ];

    const result = detectReinvestmentChains(events, '2026-11-10');
    expect(result.chains.length).toBeGreaterThan(0);
    const chain = result.chains.find((c) => c.sourceTicker === 'HGLG11' && c.targetTicker === 'KNRI11');
    expect(chain).toBeDefined();
    expect(chain?.daysGap).toBe(4); // 18 - 14 = 4 days
    expect(chain?.sameMonth).toBe(true);
    expect(result.candidateTickers.has('KNRI11')).toBe(true);
  });

  // 10. FII Opportunity Scorer V2 Dynamic Normalization
  it('10. FiiOpportunityScorer includes dividendCalendarFit with 20% weight when available', () => {
    const fiiWithCalendar = mockFii('HGLG11', {
      calendar: {
        recordDate: '2026-11-14',
        paymentDate: '2026-11-25',
        amountPerShare: 1.1,
        eventStatus: 'ANNOUNCED',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 4,
      },
    });

    const res = FiiOpportunityScorer.score(fiiWithCalendar, refDate);
    expect(res.components.dividendCalendarFit).toBe(95);
    expect(res.score).toBeGreaterThanOrEqual(70);
  });

  it('11. FiiOpportunityScorer falls back to standard 6 dimensions when strategy is disabled', () => {
    const fiiWithCalendar = mockFii('HGLG11', {
      calendar: {
        recordDate: '2026-11-14',
        paymentDate: '2026-11-25',
        amountPerShare: 1.1,
        eventStatus: 'ANNOUNCED',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 4,
      },
    });

    const res = FiiOpportunityScorer.score(fiiWithCalendar, refDate, {
      enableDividendCalendarStrategy: false,
    });
    expect(res.components.dividendCalendarFit).toBeNull();
  });

  // 12. Quality Floor Gate (APP-16I / APP-16G)
  it('12. Quality floor gate: LOW or INSUFFICIENT_DATA FIIs are NEVER promoted to Top 5 even with calendar fit 100', () => {
    const lowConfidenceFii: OpportunityAssetInput = {
      assetId: 'fii-low',
      ticker: 'POOR11',
      name: 'Fundo Sem Dados',
      assetType: 'FII',
      currency: 'BRL',
      quantity: '10',
      marketValue: '1000',
      portfolioWeight: 1.0,
      classWeight: 5.0,
      currentPrice: '100.00',
      // Missing history, missing fundamentals, missing news -> LOW confidence
      dividendCalendar: {
        ticker: 'POOR11',
        recordDate: '2026-11-13',
        exDate: '2026-11-14',
        paymentDate: '2026-11-25',
        amountPerShare: 1.5,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 3,
        daysUntilPayment: 15,
        sameMonthReinvestmentCandidate: true,
      },
    };

    const qualifiedFii = mockFii('KNRI11', {
      calendar: {
        recordDate: '2026-11-18',
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
      },
    });

    const radar = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [lowConfidenceFii, qualifiedFii],
      analysisDate: refDateStr,
      referenceDate: refDate,
    });

    // POOR11 must be rejected from qualified lists and relegated to lowConfidenceItems
    expect(radar.fiiItems.some((i) => i.ticker === 'POOR11')).toBe(false);
    expect(radar.items.some((i) => i.ticker === 'POOR11')).toBe(false);
    expect(radar.lowConfidenceItems?.some((i) => i.ticker === 'POOR11')).toBe(true);
    expect(radar.fiiItems.some((i) => i.ticker === 'KNRI11')).toBe(true);
  });

  // 13. Reinvestment Chains in Engine Result
  it('13. engine returns reinvestment chains and tags candidate FIIs', () => {
    const payerFii = mockFii('PAYR11', {
      calendar: {
        recordDate: '2026-10-31',
        paymentDate: '2026-11-12', // pays 12/11
        eventStatus: 'ANNOUNCED',
      },
    });

    const receiverFii = mockFii('RECV11', {
      calendar: {
        recordDate: '2026-11-16', // data-com 16/11 (after 12/11)
        paymentDate: '2026-11-25',
        eventStatus: 'ANNOUNCED',
      },
    });

    const radar = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [payerFii, receiverFii],
      analysisDate: refDateStr,
      referenceDate: refDate,
    });

    expect(radar.reinvestmentChains).toBeDefined();
    expect(radar.reinvestmentChains?.length).toBeGreaterThan(0);
    const recvItem = radar.allEvaluatedItems?.find((i) => i.ticker === 'RECV11');
    expect(recvItem?.dividendCalendar?.sameMonthReinvestmentCandidate).toBe(true);
    expect(radar.modelVersion).toBe('opportunity-v2.1');
  });

  // 14. Explainability generation for dividend calendar
  it('14. explainability generates positive statements for announced data-com and reinvestment', () => {
    const fii = mockFii('MALL11', {
      calendar: {
        recordDate: '2026-11-15',
        amountPerShare: 0.95,
        eventStatus: 'ANNOUNCED',
        sameMonthReinvestmentCandidate: true,
      },
    });

    const radar = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [fii],
      analysisDate: refDateStr,
      referenceDate: refDate,
    });

    const item = radar.fiiItems.find((i) => i.ticker === 'MALL11');
    expect(item).toBeDefined();
    expect(item?.positives.some((p) => p.includes('Data-com') || p.includes('provento') || p.includes('rendimento'))).toBe(true);
  });

  // 15. Explainability generation for ex-dividend risk
  it('15. explainability adds ex-dividend risk when asset is already in ex-period', () => {
    const exFii = mockFii('EXDV11', {
      calendar: {
        recordDate: '2026-11-05', // in past relative to 2026-11-10
        paymentDate: '2026-11-18',
        amountPerShare: 0.8,
        eventStatus: 'ANNOUNCED',
      },
    });

    const radar = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [exFii],
      analysisDate: refDateStr,
      referenceDate: refDate,
    });

    const item = radar.allEvaluatedItems?.find((i) => i.ticker === 'EXDV11');
    expect(item?.risks.some((r) => r.includes('data-ex'))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // APP-16I-R1: Integrity Hotfix Verification Tests (PARTE AF to AM)
  // ---------------------------------------------------------------------------

  it('16. Canonical Timezone: formatIsoDateString at 23:30 São Paulo time preserves São Paulo date (not next UTC day)', () => {
    // 2026-11-10 at 23:30:00 São Paulo (UTC-3) is 2026-11-11 02:30:00 UTC
    const spLateNight = new Date('2026-11-11T02:30:00.000Z');
    const formatted = formatIsoDateString(spLateNight, 'America/Sao_Paulo');
    expect(formatted).toBe('2026-11-10');
  });

  it('17. Normalization: normalizeDividendEvent cleans and validates raw events from providers', () => {
    // Valid event with dates, rate and exDate
    const valid = normalizeDividendEvent({
      lastDatePrior: '2026-11-15T00:00:00.000Z',
      paymentDate: '2026-11-25',
      exDate: '2026-11-16',
      approvedOn: '2026-10-31',
      rate: '1.2550',
      relatedTo: 'Rendimento Mensal',
    });
    expect(valid).toEqual({
      recordDate: '2026-11-15',
      paymentDate: '2026-11-25',
      exDate: '2026-11-16',
      approvedOn: '2026-10-31',
      rate: 1.255,
      relatedTo: 'Rendimento Mensal',
    });

    // Malformed event without any valid date returns null
    const malformed = normalizeDividendEvent({
      lastDatePrior: 'invalid-date',
      paymentDate: null,
      rate: '1.0',
    });
    expect(malformed).toBeNull();
  });

  it('18. Event Sorting: sortDividendEvents sorts out-of-order events chronologically', () => {
    const rawEvents = [
      { recordDate: '2026-12-15', paymentDate: '2026-12-25', exDate: null, approvedOn: null, rate: 1.0, relatedTo: null },
      { recordDate: '2026-10-15', paymentDate: '2026-10-25', exDate: null, approvedOn: null, rate: 0.9, relatedTo: null },
      { recordDate: '2026-11-15', paymentDate: '2026-11-25', exDate: null, approvedOn: null, rate: 1.1, relatedTo: null },
    ];
    const sorted = sortDividendEvents(rawEvents);
    expect(sorted[0]?.recordDate).toBe('2026-10-15');
    expect(sorted[1]?.recordDate).toBe('2026-11-15');
    expect(sorted[2]?.recordDate).toBe('2026-12-15');
  });

  it('19. Selection: selectRelevantDividendEvent returns null when all events are fully historical', () => {
    const historicalOnly = [
      { recordDate: '2026-09-15', paymentDate: '2026-09-25', exDate: null, approvedOn: null, rate: 1.0, relatedTo: null },
      { recordDate: '2026-10-15', paymentDate: '2026-10-25', exDate: null, approvedOn: null, rate: 1.0, relatedTo: null },
    ];
    // Reference date is 2026-11-10 (both events are in the past)
    const selected = selectRelevantDividendEvent(historicalOnly, '2026-11-10');
    expect(selected).toBeNull();
  });

  it('20. Pending Payment Flow: selectRelevantDividendEvent selects event when recordDate passed but paymentDate is in future', () => {
    const events = [
      { recordDate: '2026-10-15', paymentDate: '2026-10-25', exDate: null, approvedOn: null, rate: 0.8, relatedTo: null },
      { recordDate: '2026-11-05', paymentDate: '2026-11-14', exDate: null, approvedOn: null, rate: 1.0, relatedTo: null }, // record passed, payment pending on 14th
    ];
    const selected = selectRelevantDividendEvent(events, '2026-11-10');
    expect(selected).toBeDefined();
    expect(selected?.recordDate).toBe('2026-11-05');
    expect(selected?.paymentDate).toBe('2026-11-14');

    const eligibility = calculateDividendEligibility(selected!.recordDate, '2026-11-10', selected!.paymentDate);
    expect(eligibility.eligibilityStatus).toBe('EX_DIVIDEND');
    expect(eligibility.isPaymentPending).toBe(true);
  });

  it('21. Available Cash Chain: classifies chain as AVAILABLE_CASH_CHAIN when source paymentDate <= referenceDate', () => {
    const events: FiiDividendCalendarEvent[] = [
      {
        ticker: 'PAID11',
        recordDate: '2026-10-31',
        exDate: '2026-11-03',
        paymentDate: '2026-11-08', // Paid on 8th (in past relative to 10th -> cash available now)
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -10,
        daysUntilPayment: -2,
      },
      {
        ticker: 'TARGET11',
        recordDate: '2026-11-16', // data-com 16th (future relative to 10th)
        exDate: '2026-11-17',
        paymentDate: '2026-11-25',
        amountPerShare: 1.2,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 6,
        daysUntilPayment: 15,
      },
    ];

    const result = detectReinvestmentChains(events, '2026-11-10');
    expect(result.chains.length).toBe(1);
    const chain = result.chains[0];
    expect(chain?.chainType).toBe('AVAILABLE_CASH_CHAIN');
    expect(chain?.cashAvailableNow).toBe(true);
    expect(chain?.futureCashExpected).toBe(false);
    expect(result.candidateTickers.has('TARGET11')).toBe(true);
    expect(result.bestChainByTarget.get('TARGET11')?.sourceTicker).toBe('PAID11');
  });

  it('22. Planned Future Chain: classifies chain as PLANNED_FUTURE_CHAIN when source paymentDate > referenceDate', () => {
    const events: FiiDividendCalendarEvent[] = [
      {
        ticker: 'FUTURE11',
        recordDate: '2026-10-31',
        exDate: '2026-11-03',
        paymentDate: '2026-11-13', // Pays on 13th (future relative to 10th)
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -10,
        daysUntilPayment: 3,
      },
      {
        ticker: 'TARGET11',
        recordDate: '2026-11-18', // data-com 18th (after 13th)
        exDate: '2026-11-19',
        paymentDate: '2026-11-28',
        amountPerShare: 1.2,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 8,
        daysUntilPayment: 18,
      },
    ];

    const result = detectReinvestmentChains(events, '2026-11-10');
    expect(result.chains.length).toBe(1);
    const chain = result.chains[0];
    expect(chain?.chainType).toBe('PLANNED_FUTURE_CHAIN');
    expect(chain?.cashAvailableNow).toBe(false);
    expect(chain?.futureCashExpected).toBe(true);
  });

  it('23. Target Already Ex: target FII with recordDate < referenceDate is NOT a reinvestment candidate', () => {
    const events: FiiDividendCalendarEvent[] = [
      {
        ticker: 'SOURCE11',
        recordDate: '2026-10-25',
        paymentDate: '2026-11-02',
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -16,
        daysUntilPayment: -8,
      },
      {
        ticker: 'ALREADY_EX11',
        recordDate: '2026-11-05', // data-com passed relative to 10th!
        paymentDate: '2026-11-15',
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -5,
        daysUntilPayment: 5,
      },
    ];

    const result = detectReinvestmentChains(events, '2026-11-10');
    expect(result.candidateTickers.has('ALREADY_EX11')).toBe(false);
    expect(result.chains.length).toBe(0);
  });

  it('24. Deduplication and Best Chain: picks AVAILABLE_CASH over PLANNED_FUTURE and deduplicates', () => {
    const events: FiiDividendCalendarEvent[] = [
      {
        ticker: 'CASH_SRC11',
        recordDate: '2026-10-31',
        paymentDate: '2026-11-08', // already paid! (AVAILABLE_CASH)
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -10,
        daysUntilPayment: -2,
      },
      {
        ticker: 'FUTR_SRC11',
        recordDate: '2026-10-31',
        paymentDate: '2026-11-12', // future payment (PLANNED_FUTURE)
        amountPerShare: 1.0,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'EX_DIVIDEND',
        daysUntilRecordDate: -10,
        daysUntilPayment: 2,
      },
      {
        ticker: 'TARGET11',
        recordDate: '2026-11-16',
        paymentDate: '2026-11-25',
        amountPerShare: 1.2,
        eventStatus: 'ANNOUNCED',
        source: 'BRAPI',
        eligibilityStatus: 'ELIGIBLE',
        daysUntilRecordDate: 6,
        daysUntilPayment: 15,
      },
    ];

    const result = detectReinvestmentChains(events, '2026-11-10');
    const bestChain = result.bestChainByTarget.get('TARGET11');
    expect(bestChain).toBeDefined();
    expect(bestChain?.sourceTicker).toBe('CASH_SRC11'); // Cash in hand beats future cash!
    expect(bestChain?.chainType).toBe('AVAILABLE_CASH_CHAIN');
  });

  it('25. Engine Integration: tags target FII with bestChain details (sourceTicker, chainType, cashAvailableNow)', () => {
    const payerFii = mockFii('PAYR11', {
      calendar: {
        recordDate: '2026-10-31',
        paymentDate: '2026-11-08', // already paid (available cash)
        eventStatus: 'ANNOUNCED',
      },
    });

    const receiverFii = mockFii('RECV11', {
      calendar: {
        recordDate: '2026-11-16',
        paymentDate: '2026-11-25',
        eventStatus: 'ANNOUNCED',
      },
    });

    const radar = OpportunityRadarEngine.evaluate({
      portfolioId: 'test-port',
      assets: [payerFii, receiverFii],
      analysisDate: refDateStr,
      referenceDate: refDate,
    });

    const recvItem = radar.allEvaluatedItems?.find((i) => i.ticker === 'RECV11');
    expect(recvItem?.dividendCalendar?.sameMonthReinvestmentCandidate).toBe(true);
    expect(recvItem?.dividendCalendar?.reinvestmentSourceTicker).toBe('PAYR11');
    expect(recvItem?.dividendCalendar?.reinvestmentChainType).toBe('AVAILABLE_CASH_CHAIN');
    expect(recvItem?.dividendCalendar?.cashAvailableNow).toBe(true);
    expect(recvItem?.dividendCalendar?.futureCashExpected).toBe(false);
  });
});
