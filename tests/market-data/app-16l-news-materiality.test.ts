import { describe, it, expect } from 'vitest';
import {
  classifyNewsMateriality,
  buildDailyNewsDigest,
  deriveAssetDailyNewsStatus,
  NewsMaterialityInput,
  canonicalizeNewsEvents,
  calculateNewsScoreV2,
  RawNewsInput,
  PortfolioNewsEvent,
} from '../../packages/market-data/src';

describe('PROJECT ATLAS — APP-16L: Daily News Intelligence & Materiality Prioritization', () => {
  const referenceDate = new Date('2026-11-11T12:00:00.000Z');

  // 1. Materiality is deterministic
  it('1. ensures materiality classification is strictly deterministic', () => {
    const input: NewsMaterialityInput = {
      headline: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS: Fato Relevante — Descoberta em Bacia de Santos',
      summary: 'Descoberta de acumulação de petróleo leve em águas ultraprofundas.',
      eventType: 'FACT_RELEVANT',
      official: true,
      importance: 5,
    };

    const res1 = classifyNewsMateriality(input);
    const res2 = classifyNewsMateriality(input);

    expect(res1.level).toBe(res2.level);
    expect(res1.score).toBe(res2.score);
    expect(res1.primaryReason).toBe(res2.primaryReason);
    expect(res1.level).toBe('HIGH');
  });

  // 2. CRITICAL classification (recuperação judicial, fraude, OPA, falência)
  it('2. classifies existential events as CRITICAL (recuperação judicial, fraude, OPA)', () => {
    const rj = classifyNewsMateriality({
      headline: 'Companhia X protocola pedido de recuperação judicial na comarca de SP',
      eventType: 'FACT_RELEVANT',
      official: true,
    });
    expect(rj.level).toBe('CRITICAL');
    expect(rj.score).toBeGreaterThanOrEqual(90);
    expect(rj.primaryReason).toContain('recuperação judicial');

    const fraude = classifyNewsMateriality({
      headline: 'CVM instaura inquérito administrativo para apurar fraude contábil',
      eventType: 'REGULATORY',
      official: true,
    });
    expect(fraude.level).toBe('CRITICAL');

    const opa = classifyNewsMateriality({
      headline: 'Controlador anuncia lançamento de OPA para cancelamento de registro',
      eventType: 'CAPITAL_EVENT',
      official: true,
    });
    expect(opa.level).toBe('CRITICAL');
  });

  // 3. HIGH classification (earnings, recompra, M&A)
  it('3. classifies earnings, share buybacks, and transformational M&A as HIGH', () => {
    const earnings = classifyNewsMateriality({
      headline: 'Banco do Brasil registra lucro líquido de R$ 9,5 bilhões no 3T26',
      eventType: 'EARNINGS',
      official: true,
    });
    expect(earnings.level).toBe('HIGH');
    expect(earnings.score).toBeGreaterThanOrEqual(70);
    expect(earnings.score).toBeLessThan(90);

    const recompra = classifyNewsMateriality({
      headline: 'Conselho de Administração aprova novo programa de recompra de ações',
      eventType: 'FACT_RELEVANT',
      official: true,
    });
    expect(recompra.level).toBe('HIGH');

    const ma = classifyNewsMateriality({
      headline: 'Empresa celebra acordo de fusão e combinação de negócios estratégica',
      eventType: 'ACQUISITION',
      official: false,
    });
    expect(ma.level).toBe('HIGH');
  });

  // 4. ROUTINE classification (informes periódicos, atas de assembleia burocráticas, retificações)
  it('4. classifies periodic forms, administrative minutes, and document updates as ROUTINE', () => {
    const periodicForm = classifyNewsMateriality({
      headline: 'Companhia Aberta: Envio de informe periódico à CVM',
      category: 'informe periódico',
      eventType: 'REGULATORY',
      official: true,
    });
    expect(periodicForm.level).toBe('ROUTINE');
    expect(periodicForm.score).toBeLessThanOrEqual(14);
    expect(periodicForm.primaryReason).toContain('rotina');

    const retificacao = classifyNewsMateriality({
      headline: 'Retificação de calendário de eventos corporativos sem alteração de datas',
      eventType: 'REGULATORY',
      official: true,
    });
    expect(retificacao.level).toBe('ROUTINE');
  });

  // 5. Official routine != high (official filing must remain ROUTINE if purely administrative)
  it('5. ensures official routine filings are NOT elevated to HIGH simply because they are official', () => {
    const cvmRoutine = classifyNewsMateriality({
      headline: 'ENGIE BRASIL: Envio de informe mensal estruturado',
      category: 'informe periódico',
      eventType: 'REGULATORY',
      official: true,
      importance: 3,
    });
    expect(cvmRoutine.official).toBeUndefined(); // input wasn't mutated
    expect(cvmRoutine.level).toBe('ROUTINE');
    expect(cvmRoutine.score).toBeLessThan(15);
  });

  // 6. Earnings high but sentiment can be neutral/unknown
  it('6. separates materiality from sentiment (earnings can be HIGH with neutral sentiment)', () => {
    const earnings = classifyNewsMateriality({
      headline: 'Divulgação de resultados do 3T26 e apresentação para analistas',
      eventType: 'EARNINGS',
      official: true,
    });
    expect(earnings.level).toBe('HIGH');
  });

  // 7. Normal FII dividend is MEDIUM, not automatically HIGH
  it('7. classifies standard ordinary FII dividends as MEDIUM', () => {
    const fiiDividend = classifyNewsMateriality({
      headline: 'HGLG11: Aviso aos Cotistas — Pagamento de rendimentos referente a outubro/26',
      eventType: 'DIVIDEND',
      official: true,
    });
    expect(fiiDividend.level).toBe('MEDIUM');
    expect(fiiDividend.score).toBeGreaterThanOrEqual(40);
    expect(fiiDividend.score).toBeLessThan(70);
  });

  // 8. Dividend cut is HIGH
  it('8. classifies severe dividend cuts or disruptions as HIGH', () => {
    const cut = classifyNewsMateriality({
      headline: 'Companhia comunica corte de dividendos para preservação de caixa',
      eventType: 'DIVIDEND',
      official: true,
    });
    expect(cut.level).toBe('HIGH');
    expect(cut.primaryReason).toContain('proventos');
  });

  // 9. CVM + Media Deduplication preserves officiality and descriptive headline
  it('9. deduplicates CVM official document and media coverage into one canonical event with descriptive title', () => {
    const raw: RawNewsInput[] = [
      {
        id: 'cvm_doc_1',
        headline: 'PETROBRAS (PETR4): Fato Relevante — Aprovação de Plano Estratégico 2027',
        summary: 'Aprovação do plano de investimentos para transição energética e E&P.',
        url: 'https://rad.cvm.gov.br/ENET/doc1.pdf',
        sourceName: 'CVM',
        publishedAt: '2026-11-10T14:00:00.000Z',
        ticker: 'PETR4',
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
      },
      {
        id: 'media_1',
        headline: 'Petrobras aprova plano estratégico 2027 com foco em exploração',
        summary: 'Conselho de administração da estatal deu aval ao novo plano quinquenal.',
        url: 'https://infomoney.com.br/petr4-plano',
        sourceName: 'InfoMoney',
        publishedAt: '2026-11-10T14:30:00.000Z',
        ticker: 'PETR4',
        provider: 'FINANCIAL_MEDIA',
        sourceType: 'TRUSTED_FINANCIAL_MEDIA',
        official: false,
      },
    ];

    const canonical = canonicalizeNewsEvents(raw, referenceDate);
    expect(canonical.length).toBe(1);
    expect(canonical[0]!.official).toBe(true);
    expect(canonical[0]!.sourceType).toBe('OFFICIAL_REGULATORY');
    expect(canonical[0]!.sources.length).toBe(2);
    expect(canonical[0]!.sources.some(s => s.name === 'CVM')).toBe(true);
    expect(canonical[0]!.sources.some(s => s.name === 'InfoMoney')).toBe(true);
  });

  // 10. Follow-up suppression (same day, same topic updates are clustered)
  it('10. suppresses duplicate follow-up articles within cluster window', () => {
    const raw: RawNewsInput[] = [
      {
        headline: 'Vale (VALE3) assina acordo definitivo para reparação de Mariana',
        url: 'https://valor.globo.com/vale-mariana',
        sourceName: 'Valor Econômico',
        publishedAt: '2026-11-10T10:00:00.000Z',
        ticker: 'VALE3',
      },
      {
        headline: 'Vale firma acordo de R$ 170 bi para repactuação do desastre de Mariana',
        url: 'https://estadao.com.br/vale-acordo',
        sourceName: 'Estadão',
        publishedAt: '2026-11-10T11:00:00.000Z',
        ticker: 'VALE3',
      },
    ];

    const canonical = canonicalizeNewsEvents(raw, referenceDate);
    expect(canonical.length).toBe(1);
    expect(canonical[0]!.sources.length).toBe(2);
  });

  // 11. Asset daily news status derivation
  it('11. derives accurate AssetNewsDailyStatus based on recent events', () => {
    const criticalEvent: PortfolioNewsEvent = {
      id: 'e1',
      canonicalEventId: 'e1',
      headline: 'Empresa em recuperação judicial',
      summary: '',
      publishedAt: '2026-11-10T12:00:00.000Z',
      importance: 5,
      sentiment: 'NEGATIVE',
      sentimentScore: -0.8,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'FACT_RELEVANT',
      assets: ['PETR4'],
      primaryTickers: ['PETR4'],
      secondaryTickers: [],
      sources: [],
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
      freshness: 'BREAKING',
      decayWeight: 1.0,
      materiality: 'CRITICAL',
    };

    const status1 = deriveAssetDailyNewsStatus('PETR4', [criticalEvent]);
    expect(status1).toBe('MATERIAL_EVENT');

    const routineEvent: PortfolioNewsEvent = {
      ...criticalEvent,
      id: 'e2',
      headline: 'Envio de informe periódico',
      materiality: 'ROUTINE',
      assets: ['VALE3'],
      primaryTickers: ['VALE3'],
    };

    const status2 = deriveAssetDailyNewsStatus('VALE3', [routineEvent]);
    expect(status2).toBe('ROUTINE_ONLY');

    const status3 = deriveAssetDailyNewsStatus('TAEE11', []);
    expect(status3).toBe('NO_RECENT_NEWS');
  });

  // 12. Silence (NO_RECENT_NEWS) is never penalized
  it('12. ensures silence (NO_RECENT_NEWS) returns score null in news scorer without penalty', () => {
    const scoreResult = calculateNewsScoreV2([], 'HYPE3', referenceDate);
    expect(scoreResult.score).toBeNull();
    expect(scoreResult.confidenceMultiplier).toBe(0.0);
    expect(scoreResult.explainability).toContain('Sem notícias recentes');
  });

  // 13. Provider unavailable handling
  it('13. correctly tags asset status as PROVIDER_UNAVAILABLE when upstream provider fails', () => {
    const status = deriveAssetDailyNewsStatus('BBAS3', [], {
      officialStatus: 'OFFICIAL_PROVIDER_UNAVAILABLE',
    });
    expect(status).toBe('PROVIDER_UNAVAILABLE');
  });

  // 14. Daily digest ordering hierarchy
  it('14. orders Daily Digest by CRITICAL > HIGH > MEDIUM > Freshness > Importance', () => {
    const events: PortfolioNewsEvent[] = [
      {
        id: 'ev_med',
        canonicalEventId: 'ev_med',
        headline: 'TAEE11: Declaração de proventos ordinários',
        summary: '',
        publishedAt: '2026-11-11T10:00:00.000Z',
        importance: 3,
        sentiment: 'POSITIVE',
        sentimentScore: 0.6,
        sentimentMethod: 'EVENT_HEADLINE_RULE',
        eventType: 'DIVIDEND',
        assets: ['TAEE11'],
        primaryTickers: ['TAEE11'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc_med.pdf' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'MEDIUM',
        materialityScore: 55,
        materialityReason: 'Proventos ordinários',
      },
      {
        id: 'ev_crit',
        canonicalEventId: 'ev_crit',
        headline: 'COGN3: Notificação judicial com pedido de intervenção',
        summary: '',
        publishedAt: '2026-11-10T10:00:00.000Z',
        importance: 5,
        sentiment: 'NEGATIVE',
        sentimentScore: -0.9,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'FACT_RELEVANT',
        assets: ['COGN3'],
        primaryTickers: ['COGN3'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc_crit.pdf' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'VERY_RECENT',
        decayWeight: 0.9,
        materiality: 'CRITICAL',
        materialityScore: 95,
        materialityReason: 'Intervenção regulatória',
      },
      {
        id: 'ev_high',
        canonicalEventId: 'ev_high',
        headline: 'BBAS3: Lucro líquido cresce 12% no balanço do 3T26',
        summary: '',
        publishedAt: '2026-11-11T09:00:00.000Z',
        importance: 4,
        sentiment: 'POSITIVE',
        sentimentScore: 0.8,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'EARNINGS',
        assets: ['BBAS3'],
        primaryTickers: ['BBAS3'],
        secondaryTickers: [],
        sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br/doc_high.pdf' }],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'HIGH',
        materialityScore: 85,
        materialityReason: 'Divulgação de resultados trimestrais',
      },
    ];

    const digest = buildDailyNewsDigest(events, { referenceDate, maxItems: 10 });
    expect(digest.items.length).toBe(3);
    // Order must be CRITICAL first, then HIGH, then MEDIUM
    expect(digest.items[0]!.materiality).toBe('CRITICAL');
    expect(digest.items[0]!.ticker).toBe('COGN3');
    expect(digest.items[1]!.materiality).toBe('HIGH');
    expect(digest.items[1]!.ticker).toBe('BBAS3');
    expect(digest.items[2]!.materiality).toBe('MEDIUM');
    expect(digest.items[2]!.ticker).toBe('TAEE11');
  });

  // 15. Daily digest max items capping
  it('15. caps Daily Digest items to maxItems parameter (5-10 items)', () => {
    const manyEvents: PortfolioNewsEvent[] = Array.from({ length: 25 }, (_, i) => ({
      id: `e_${i}`,
      canonicalEventId: `e_${i}`,
      headline: `Empresa ${i}: Fato Relevante ${i}`,
      summary: '',
      publishedAt: '2026-11-11T08:00:00.000Z',
      importance: 4,
      sentiment: 'NEUTRAL',
      sentimentScore: 0.0,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'FACT_RELEVANT',
      assets: [`TICK${i}`],
      primaryTickers: [`TICK${i}`],
      secondaryTickers: [],
      sources: [],
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
      freshness: 'BREAKING',
      decayWeight: 1.0,
      materiality: 'HIGH',
    }));

    const digest = buildDailyNewsDigest(manyEvents, { referenceDate, maxItems: 7 });
    expect(digest.items.length).toBe(7);
    expect(digest.totalEvents).toBe(25);
  });

  // 16. Routine events filtered from digest when material items exist
  it('16. omits pure routine events from top digest items when higher material events exist', () => {
    const events: PortfolioNewsEvent[] = [
      {
        id: 'e_high',
        canonicalEventId: 'e_high',
        headline: 'PETR4: Anúncio de grande descoberta em bloco marítimo',
        summary: '',
        publishedAt: '2026-11-11T09:00:00.000Z',
        importance: 4,
        sentiment: 'POSITIVE',
        sentimentScore: 0.8,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'FACT_RELEVANT',
        assets: ['PETR4'],
        primaryTickers: ['PETR4'],
        secondaryTickers: [],
        sources: [],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'HIGH',
      },
      {
        id: 'e_routine',
        canonicalEventId: 'e_routine',
        headline: 'VALE3: Envio de informe periódico regulatório',
        summary: '',
        publishedAt: '2026-11-11T10:00:00.000Z',
        importance: 1,
        sentiment: 'NEUTRAL',
        sentimentScore: 0.0,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'REGULATORY',
        assets: ['VALE3'],
        primaryTickers: ['VALE3'],
        secondaryTickers: [],
        sources: [],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'BREAKING',
        decayWeight: 1.0,
        materiality: 'ROUTINE',
      },
    ];

    const digest = buildDailyNewsDigest(events, { referenceDate, maxItems: 1 });
    expect(digest.items.length).toBe(1);
    expect(digest.items[0]!.materiality).toBe('HIGH');
  });

  // 17. Source preservation & official links
  it('17. preserves canonical official document URLs in digest items', () => {
    const event: PortfolioNewsEvent = {
      id: 'e_cvm_link',
      canonicalEventId: 'e_cvm_link',
      headline: 'HGLG11: Aquisição de galpão logístico em Extrema-MG',
      summary: '',
      publishedAt: '2026-11-11T11:00:00.000Z',
      importance: 4,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'ACQUISITION',
      assets: ['HGLG11'],
      primaryTickers: ['HGLG11'],
      secondaryTickers: [],
      sources: [
        { name: 'B3', url: 'https://fnet.bmfbovespa.com.br/doc123.pdf' },
        { name: 'InfoMoney', url: 'https://infomoney.com.br/hglg11-galpao' },
      ],
      provider: 'B3',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
      freshness: 'BREAKING',
      decayWeight: 1.0,
      materiality: 'HIGH',
    };

    const digest = buildDailyNewsDigest([event], { referenceDate });
    expect(digest.items[0]!.canonicalUrl).toBe('https://fnet.bmfbovespa.com.br/doc123.pdf');
    expect(digest.items[0]!.sourcesCount).toBe(2);
  });

  // 18. FII material real estate operations
  it('18. classifies FII real estate operations (vacância, locação, compra de imóvel) as HIGH', () => {
    const locacao = classifyNewsMateriality({
      headline: 'KNRI11 comunica nova locação de 15.000 m² no Rochaverá Corporate Towers',
      eventType: 'FACT_RELEVANT',
      official: true,
    });
    expect(locacao.level).toBe('HIGH');
    expect(locacao.primaryReason).toContain('imobiliária');

    const vacancia = classifyNewsMateriality({
      headline: 'BRCR11 informa aumento de vacância após devolução de 4 andares',
      eventType: 'FACT_RELEVANT',
      official: true,
    });
    expect(vacancia.level).toBe('HIGH');
  });

  // 19. Routine events do not contaminate official confidence bonus
  it('19. ensures routine official events do NOT inflate confidence in news scoring', () => {
    const routineEvents: PortfolioNewsEvent[] = [
      {
        id: 'r1',
        canonicalEventId: 'r1',
        headline: 'Envio de formulário de referência',
        summary: '',
        publishedAt: '2026-11-09T10:00:00.000Z',
        importance: 1,
        sentiment: 'NEUTRAL',
        sentimentScore: 0.0,
        sentimentMethod: 'OFFICIAL_EVENT_RULE',
        eventType: 'REGULATORY',
        assets: ['ITSA4'],
        primaryTickers: ['ITSA4'],
        secondaryTickers: [],
        sources: [],
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        official: true,
        freshness: 'VERY_RECENT',
        decayWeight: 0.9,
        materiality: 'ROUTINE',
      },
    ];

    const scoreResult = calculateNewsScoreV2(routineEvents, 'ITSA4', referenceDate);
    // Since the only event is routine, the officialBonus should NOT be granted (0.0 instead of 0.20)
    // base (0.4) + countBonus (0.1) + importanceBonus (1/5 * 0.4 = 0.08) = 0.58
    expect(scoreResult.confidenceMultiplier).toBeLessThanOrEqual(0.60);
  });

  // 20. Radar impact explanation
  it('20. generates accurate radarImpact in digest items', () => {
    const posEvent: PortfolioNewsEvent = {
      id: 'p1',
      canonicalEventId: 'p1',
      headline: 'PRIO3: Produção atinge recorde histórico no campo de Frade',
      summary: '',
      publishedAt: '2026-11-11T09:00:00.000Z',
      importance: 4,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'EVENT_HEADLINE_RULE',
      eventType: 'FACT_RELEVANT',
      assets: ['PRIO3'],
      primaryTickers: ['PRIO3'],
      secondaryTickers: [],
      sources: [],
      provider: 'GOOGLE_NEWS',
      sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
      official: false,
      freshness: 'BREAKING',
      decayWeight: 1.0,
      materiality: 'HIGH',
    };

    const digest = buildDailyNewsDigest([posEvent], { referenceDate });
    expect(digest.items[0]!.radarImpact).toBe('POSITIVE');
  });
});
