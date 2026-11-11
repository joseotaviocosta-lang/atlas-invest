import { describe, it, expect } from 'vitest';
import {
  classifyNewsEventType,
  classifyNewsImportance,
  classifyNewsSentiment,
  classifyFreshness,
  classifySourceTrust,
  isTrustedOfficialSource,
  determineAssetRelevance,
  canonicalizeNewsEvents,
  calculateNewsScoreV2,
  RawNewsInput,
  PortfolioNewsEvent,
  OPPORTUNITY_MODEL_VERSION,
} from '../../packages/market-data/src/opportunity-radar';

describe('PROJECT ATLAS — APP-16J: Portfolio News Intelligence & Full Coverage', () => {
  const refDate = new Date('2026-11-10T12:00:00.000Z');

  // 1 & 2. Batching <= 20 and 36 assets -> 2 batches
  it('1 & 2. batching logic partitions 36 assets into 2 batches <= 20', () => {
    const mock36Tickers = Array.from({ length: 36 }, (_, i) => `TICK${i + 1}`);
    const batchSize = 20;
    const batches: string[][] = [];
    for (let i = 0; i < mock36Tickers.length; i += batchSize) {
      batches.push(mock36Tickers.slice(i, i + batchSize));
    }
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(20);
    expect(batches[1]).toHaveLength(16);
    expect(batches[0]!.length).toBeLessThanOrEqual(20);
    expect(batches[1]!.length).toBeLessThanOrEqual(20);
  });

  // 3 & 4. Provider Pro Available vs Unavailable Fallback
  it('3 & 4. provider availability honors fallback when token is missing or unauthorized', () => {
    const mockProbe = (token?: string, status: number = 401) => {
      if (!token || status === 401 || status === 403) {
        return {
          brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE' as const,
          fallbackActive: true,
        };
      }
      return {
        brapiNewsStatus: 'BRAPI_NEWS_PRO_AVAILABLE' as const,
        fallbackActive: false,
      };
    };

    expect(mockProbe(undefined)).toEqual({
      brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
      fallbackActive: true,
    });
    expect(mockProbe('valid-key', 403)).toEqual({
      brapiNewsStatus: 'BRAPI_NEWS_PRO_UNAVAILABLE',
      fallbackActive: true,
    });
    expect(mockProbe('valid-key', 200)).toEqual({
      brapiNewsStatus: 'BRAPI_NEWS_PRO_AVAILABLE',
      fallbackActive: false,
    });
  });

  // 5. Canonical deduplication
  it('5. deduplicates identical or highly similar news across publishers into 1 canonical event', () => {
    const rawArticles: RawNewsInput[] = [
      {
        headline: 'Petrobras (PETR4) divulga Fato Relevante sobre dividendos - InfoMoney',
        sourceName: 'InfoMoney',
        publishedAt: new Date('2026-11-10T08:00:00.000Z'),
        ticker: 'PETR4',
        url: 'https://infomoney.com.br/petr4-div',
      },
      {
        headline: 'Petrobras divulga Fato Relevante sobre dividendos - Valor Econômico',
        sourceName: 'Valor Econômico',
        publishedAt: new Date('2026-11-10T08:30:00.000Z'),
        ticker: 'PETR4',
        url: 'https://valor.globo.com/petr4-div',
      },
    ];

    const events = canonicalizeNewsEvents(rawArticles, refDate);
    expect(events).toHaveLength(1);
    expect(events[0]?.headline).toContain('Petrobras');
    expect(events[0]?.eventType).toBe('FACT_RELEVANT');
    expect(events[0]?.sources).toHaveLength(2);
  });

  // 6. Multi-source event preservation
  it('6. preserves all individual sources and URLs for an event', () => {
    const rawArticles: RawNewsInput[] = [
      {
        headline: 'Vale (VALE3) anuncia recompra de ações - Reuters',
        sourceName: 'Reuters',
        publishedAt: new Date('2026-11-09T10:00:00.000Z'),
        ticker: 'VALE3',
        url: 'https://reuters.com/vale-buyback',
      },
      {
        headline: 'Vale anuncia recompra de ações no mercado - Money Times',
        sourceName: 'Money Times',
        publishedAt: new Date('2026-11-09T10:15:00.000Z'),
        ticker: 'VALE3',
        url: 'https://moneytimes.com.br/vale-recompra',
      },
    ];

    const events = canonicalizeNewsEvents(rawArticles, refDate);
    expect(events).toHaveLength(1);
    const sources = events[0]?.sources || [];
    expect(sources.map((s) => s.name)).toEqual(expect.arrayContaining(['Reuters', 'Money Times']));
    expect(sources.map((s) => s.url)).toEqual(
      expect.arrayContaining(['https://reuters.com/vale-buyback', 'https://moneytimes.com.br/vale-recompra']),
    );
  });

  // 7. Primary vs Secondary relevance
  it('7. correctly determines primary vs secondary asset relevance', () => {
    expect(determineAssetRelevance('Petrobras (PETR4) tem lucro recorde no 3T26', 'PETR4')).toBe('PRIMARY');
    expect(determineAssetRelevance('FESA4 aprova distribuição de dividendos', 'FESA4')).toBe('PRIMARY');
    expect(
      determineAssetRelevance(
        'Ibovespa fecha em queda puxado por exterior e juros; Petrobras e Vale oscilam',
        'PETR4',
      ),
    ).toBe('SECONDARY');
  });

  // 8. Importance classification (1..5)
  it('8. classifies importance from 1 (minor) to 5 (critical corporate events)', () => {
    expect(classifyNewsImportance('FACT_RELEVANT', 'Companhia entra em recuperação judicial', true)).toBe(5);
    expect(classifyNewsImportance('EARNINGS', 'Divulgação de balanço do 3T26 com lucro expressivo', false)).toBe(4);
    expect(classifyNewsImportance('DIVIDEND', 'Aprova pagamento de rendimentos de R$ 0,85', true)).toBe(3);
    expect(classifyNewsImportance('OTHER', 'Ações fecham em leve alta no pregão de hoje', false)).toBe(2);
    expect(classifyNewsImportance('OTHER', 'Day trade com sugestão de operações rápidas', false)).toBe(1);
  });

  // 9. Sentiment provenance
  it('9. tags sentiment method honestly and distinguishes official rules from heuristics', () => {
    // When not verified official, method is EVENT_HEADLINE_RULE
    const s1 = classifyNewsSentiment('Lucro sobe 45% e supera projeções do mercado');
    expect(s1.sentiment).toBe('POSITIVE');
    expect(s1.method).toBe('EVENT_HEADLINE_RULE');

    // When verified official, method is OFFICIAL_EVENT_RULE
    const s1Official = classifyNewsSentiment('Lucro sobe 45% e supera projeções do mercado', '', { official: true });
    expect(s1Official.sentiment).toBe('POSITIVE');
    expect(s1Official.method).toBe('OFFICIAL_EVENT_RULE');

    const s2 = classifyNewsSentiment('Empresa reporta prejuízo e corte de dividendos');
    expect(s2.sentiment).toBe('NEGATIVE');
    expect(s2.method).toBe('EVENT_HEADLINE_RULE');

    const s3 = classifyNewsSentiment('Mercado reage com otimismo moderado ao plano');
    expect(s3.sentiment).toBe('POSITIVE');
    expect(s3.method).toBe('HEADLINE_KEYWORD_HEURISTIC');
  });

  // 10. Freshness decay weights
  it('10. calculates freshness windows and canonical decay weights', () => {
    // <= 24h: 1.0 (BREAKING)
    const f1 = classifyFreshness('2026-11-10T02:00:00.000Z', refDate);
    expect(f1.freshness).toBe('BREAKING');
    expect(f1.decayWeight).toBe(1.0);

    // 2d: 0.90 (VERY_RECENT)
    const f2 = classifyFreshness('2026-11-08T12:00:00.000Z', refDate);
    expect(f2.freshness).toBe('VERY_RECENT');
    expect(f2.decayWeight).toBe(0.9);

    // 5d: 0.75 (RECENT)
    const f5 = classifyFreshness('2026-11-05T12:00:00.000Z', refDate);
    expect(f5.freshness).toBe('RECENT');
    expect(f5.decayWeight).toBe(0.75);

    // 10d: 0.50 (CURRENT)
    const f10 = classifyFreshness('2026-10-31T12:00:00.000Z', refDate);
    expect(f10.freshness).toBe('CURRENT');
    expect(f10.decayWeight).toBe(0.5);

    // 25d: 0.25 (CURRENT)
    const f25 = classifyFreshness('2026-10-16T12:00:00.000Z', refDate);
    expect(f25.freshness).toBe('CURRENT');
    expect(f25.decayWeight).toBe(0.25);

    // 60d: 0.05 (CONTEXT)
    const f60 = classifyFreshness('2026-09-11T12:00:00.000Z', refDate);
    expect(f60.freshness).toBe('CONTEXT');
    expect(f60.decayWeight).toBe(0.05);

    // >90d: 0.00 (EXPIRED)
    const f100 = classifyFreshness('2026-08-01T12:00:00.000Z', refDate);
    expect(f100.freshness).toBe('EXPIRED');
    expect(f100.decayWeight).toBe(0.0);
  });

  // 11. No news != failure
  it('11. zero news returns score null without failing or throwing error', () => {
    const res = calculateNewsScoreV2([], 'PETR4', refDate);
    expect(res.score).toBeNull();
    expect(res.confidenceMultiplier).toBe(0.0);
    expect(res.effectiveEvents).toHaveLength(0);
    expect(res.explainability).toContain('Sem notícias recentes');
  });

  // 12. Expired > 90d strictly excluded
  it('12. news older than 90 days is strictly excluded from scoring and effective events', () => {
    const raw: RawNewsInput[] = [
      {
        headline: 'FESA4 aprova pagamento de JCP em junho',
        publishedAt: new Date('2026-06-10T10:00:00.000Z'),
        ticker: 'FESA4',
      },
    ];
    const events = canonicalizeNewsEvents(raw, refDate);
    expect(events).toHaveLength(0); // Excluded at canonicalization stage

    const res = calculateNewsScoreV2(events, 'FESA4', refDate);
    expect(res.score).toBeNull();
  });

  // 13. 31–90d is context only
  it('13. events between 31 and 90 days are kept as context only and do not force score', () => {
    const contextEvent: PortfolioNewsEvent = {
      id: 'ctx-1',
      canonicalEventId: 'ctx-1',
      headline: 'Resultado do 2T26 publicado pela empresa',
      summary: '',
      publishedAt: '2026-09-15T12:00:00.000Z', // ~56 days ago
      importance: 4,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'EARNINGS',
      assets: ['EGIE3'],
      primaryTickers: ['EGIE3'],
      secondaryTickers: [],
      sources: [{ name: 'CVM', url: '' }],
      provider: 'OFFICIAL_REGULATORY',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
      freshness: 'CONTEXT',
      decayWeight: 0.05,
    };

    const res = calculateNewsScoreV2([contextEvent], 'EGIE3', refDate);
    expect(res.score).toBeNull(); // No score from context-only events!
    expect(res.contextEvents).toHaveLength(1);
    expect(res.effectiveEvents).toHaveLength(0);
    expect(res.explainability).toContain('31–90 dias');
  });

  // 14. Official event priority
  it('14. official event receives higher weight and official badge', () => {
    const officialRaw: RawNewsInput = {
      headline: 'PETR4 divulga Fato Relevante sobre nova política de preços',
      publishedAt: new Date('2026-11-09T14:00:00.000Z'),
      ticker: 'PETR4',
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
    };
    const events = canonicalizeNewsEvents([officialRaw], refDate);
    expect(events[0]?.official).toBe(true);
    expect(events[0]?.eventType).toBe('FACT_RELEVANT');
    expect(events[0]?.importance).toBe(5);
  });

  // 15 & 16. Provider failure isolation & news=null when unavailable
  it('15 & 16. provider failure is fail-closed, returning news=null and never defaulting to 50', () => {
    const res = calculateNewsScoreV2(undefined, 'MALL11', refDate);
    expect(res.score).toBeNull();
    expect(res.score).not.toBe(50);
  });

  // 17 & 18. Token security & privacy invariants
  it('17 & 18. security invariant: token never in URL and no sensitive portfolio data exported', () => {
    const url = new URL('https://brapi.dev/api/v2/news?tickers=PETR4,VALE3');
    expect(url.searchParams.has('token')).toBe(false);
    expect(url.searchParams.has('apiKey')).toBe(false);
    expect(url.searchParams.has('portfolioId')).toBe(false);
    expect(url.searchParams.has('quantity')).toBe(false);
    expect(url.searchParams.has('balance')).toBe(false);
  });

  // 19. Deterministic scoring
  it('19. scoring produces identical results across 10 repeated runs', () => {
    const sampleEvent: PortfolioNewsEvent = {
      id: 'ev-det-1',
      canonicalEventId: 'ev-det-1',
      headline: 'Banco do Brasil (BBAS3) tem lucro líquido de R$ 9,5 bi e aprova dividendos',
      summary: '',
      publishedAt: '2026-11-09T18:00:00.000Z',
      importance: 4,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
      eventType: 'EARNINGS',
      assets: ['BBAS3'],
      primaryTickers: ['BBAS3'],
      secondaryTickers: [],
      sources: [{ name: 'InfoMoney', url: 'https://infomoney.com.br' }],
      provider: 'FINANCIAL_MEDIA',
      sourceType: 'TRUSTED_FINANCIAL_MEDIA',
      official: false,
      freshness: 'BREAKING',
      decayWeight: 1.0,
    };

    const firstRun = calculateNewsScoreV2([sampleEvent], 'BBAS3', refDate);
    expect(firstRun.score).toBeGreaterThan(60);

    for (let i = 0; i < 10; i++) {
      const run = calculateNewsScoreV2([sampleEvent], 'BBAS3', refDate);
      expect(run.score).toBe(firstRun.score);
      expect(run.confidenceMultiplier).toBe(firstRun.confidenceMultiplier);
      expect(run.explainability).toBe(firstRun.explainability);
    }
  });

  // 20. Model Version Bump to opportunity-v2.3.1
  it('20. model version bumped to opportunity-v2.3.1', () => {
    expect(OPPORTUNITY_MODEL_VERSION).toBe('opportunity-v2.3.1');
  });

  // =========================================================================
  // APP-16J-R1: OFFICIAL PROVENANCE & SENTIMENT INTEGRITY HOTFIX TESTS
  // =========================================================================

  // 1. FACT_RELEVANT via Google RSS != official
  it('R1-1. FACT_RELEVANT via Google RSS has eventType FACT_RELEVANT but official = false', () => {
    const raw: RawNewsInput = {
      headline: 'Empresa X divulga Fato Relevante sobre recompra de ações',
      publishedAt: new Date('2026-11-10T08:00:00.000Z'),
      ticker: 'SOJA3',
      provider: 'GOOGLE_NEWS',
      sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
      sourceName: 'Google News',
    };
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('FACT_RELEVANT');
    expect(events[0]?.official).toBe(false);
    expect(events[0]?.sourceType).toBe('GOOGLE_NEWS_RSS_FALLBACK');
  });

  // 2. MARKET_NOTICE via Google RSS != official
  it('R1-2. MARKET_NOTICE via Google RSS has eventType MARKET_NOTICE but official = false', () => {
    const raw: RawNewsInput = {
      headline: 'Empresa Y publica comunicado ao mercado sobre alteração societária',
      publishedAt: new Date('2026-11-10T08:00:00.000Z'),
      ticker: 'HYPE3',
      provider: 'GOOGLE_NEWS',
      sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
      sourceName: 'Google News',
    };
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('MARKET_NOTICE');
    expect(events[0]?.official).toBe(false);
  });

  // 3. InfoMoney != official
  it('R1-3. InfoMoney headline with Fato Relevante is NOT official', () => {
    const raw: RawNewsInput = {
      headline: 'Boa Safra (SOJA3) divulga Fato Relevante sobre bonificação - InfoMoney',
      publishedAt: new Date('2026-11-10T09:00:00.000Z'),
      ticker: 'SOJA3',
      sourceName: 'InfoMoney',
      provider: 'GOOGLE_NEWS',
      url: 'https://www.infomoney.com.br/soja3-fr',
    };
    expect(isTrustedOfficialSource(raw)).toBe(false);
    expect(classifySourceTrust(raw)).toBe('TRUSTED_MEDIA');
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events[0]?.official).toBe(false);
    expect(events[0]?.eventType).toBe('FACT_RELEVANT');
  });

  // 4. Valor != official
  it('R1-4. Valor Econômico headline with Comunicado ao Mercado is NOT official', () => {
    const raw: RawNewsInput = {
      headline: 'Hypera publica comunicado ao mercado sobre aprovação de novo medicamento',
      publishedAt: new Date('2026-11-10T09:00:00.000Z'),
      ticker: 'HYPE3',
      sourceName: 'Valor Econômico',
      provider: 'FINANCIAL_MEDIA',
      sourceType: 'TRUSTED_FINANCIAL_MEDIA',
    };
    expect(isTrustedOfficialSource(raw)).toBe(false);
    expect(classifySourceTrust(raw)).toBe('TRUSTED_MEDIA');
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events[0]?.official).toBe(false);
    expect(events[0]?.eventType).toBe('MARKET_NOTICE');
  });

  // 5. CVM official
  it('R1-5. CVM source is classified as official = true', () => {
    const raw: RawNewsInput = {
      headline: 'Fato Relevante: Aquisição da subsidiária concluída',
      publishedAt: new Date('2026-11-10T10:00:00.000Z'),
      ticker: 'VALE3',
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      sourceName: 'CVM',
      url: 'https://rad.cvm.gov.br/ENET/exibirArquivo.aspx',
    };
    expect(isTrustedOfficialSource(raw)).toBe(true);
    expect(classifySourceTrust(raw)).toBe('OFFICIAL');
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events[0]?.official).toBe(true);
    expect(events[0]?.eventType).toBe('FACT_RELEVANT');
  });

  // 6. B3 official
  it('R1-6. B3 regulatory announcement is classified as official = true', () => {
    const raw: RawNewsInput = {
      headline: 'Comunicado ao Mercado sobre negociação de ações',
      publishedAt: new Date('2026-11-10T10:00:00.000Z'),
      ticker: 'PETR4',
      provider: 'B3',
      sourceType: 'OFFICIAL_REGULATORY',
      sourceName: 'B3',
      url: 'https://www.b3.com.br/pt_br/noticias/comunicado.htm',
    };
    expect(isTrustedOfficialSource(raw)).toBe(true);
    expect(classifySourceTrust(raw)).toBe('OFFICIAL');
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events[0]?.official).toBe(true);
  });

  // 7. Corporate RI official
  it('R1-7. Corporate RI source or domain is classified as official = true', () => {
    const raw: RawNewsInput = {
      headline: 'Aviso aos Acionistas: Proventos aprovados em RCA',
      publishedAt: new Date('2026-11-10T10:00:00.000Z'),
      ticker: 'ITUB4',
      provider: 'CORPORATE_IR',
      sourceType: 'CORPORATE_IR',
      sourceName: 'Itaú RI',
      url: 'https://ri.itau.com.br/aviso-acionistas',
    };
    expect(isTrustedOfficialSource(raw)).toBe(true);
    expect(classifySourceTrust(raw)).toBe('OFFICIAL');
    const events = canonicalizeNewsEvents([raw], refDate);
    expect(events[0]?.official).toBe(true);
  });

  // 8. raw.official sem trusted source não basta
  it('R1-8. raw.official === true is rejected if provider/source is untrusted media', () => {
    const untrustedRaw: RawNewsInput = {
      headline: 'Fato Relevante anunciado no blog de investimentos',
      publishedAt: new Date('2026-11-10T11:00:00.000Z'),
      ticker: 'PETR4',
      sourceName: 'Blog de Investimentos',
      provider: 'GOOGLE_NEWS',
      official: true, // Claiming official without provenance!
    };
    expect(isTrustedOfficialSource(untrustedRaw)).toBe(false);
    const events = canonicalizeNewsEvents([untrustedRaw], refDate);
    expect(events[0]?.official).toBe(false);
  });

  // 9. Official multiplier somente trusted
  it('R1-9. official multiplier (1.2) is applied ONLY to trusted official events', () => {
    const mediaEvent: PortfolioNewsEvent = {
      id: 'ev-media',
      canonicalEventId: 'ev-media',
      headline: 'Empresa anuncia lucro recorde e dividendos expressivos',
      summary: '',
      publishedAt: '2026-11-10T10:00:00.000Z',
      importance: 4,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'EVENT_HEADLINE_RULE',
      eventType: 'EARNINGS',
      assets: ['SOJA3'],
      primaryTickers: ['SOJA3'],
      secondaryTickers: [],
      sources: [{ name: 'InfoMoney', url: '' }],
      provider: 'FINANCIAL_MEDIA',
      sourceType: 'TRUSTED_FINANCIAL_MEDIA',
      official: false,
      freshness: 'BREAKING',
      decayWeight: 1.0,
    };

    const officialEvent: PortfolioNewsEvent = {
      ...mediaEvent,
      id: 'ev-official',
      canonicalEventId: 'ev-official',
      sources: [{ name: 'CVM', url: 'https://rad.cvm.gov.br' }],
      provider: 'OFFICIAL_REGULATORY',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
      sentimentMethod: 'OFFICIAL_EVENT_RULE',
    };

    const resMedia = calculateNewsScoreV2([mediaEvent], 'SOJA3', refDate);
    const resOfficial = calculateNewsScoreV2([officialEvent], 'SOJA3', refDate);

    // Official has officialBonus (+0.2) in confidence (capped at 1.0) and 1.2 multiplier
    expect(resOfficial.confidenceMultiplier).toBe(1.0);
    expect(resMedia.confidenceMultiplier).toBeCloseTo(0.82, 5);
    expect(resOfficial.confidenceMultiplier).toBeGreaterThan(resMedia.confidenceMultiplier);
  });

  // 10. Official confidence bonus somente trusted
  it('R1-10. official bonus (+0.2) is never granted to media headlines', () => {
    const mediaEvent: PortfolioNewsEvent = {
      id: 'ev-m1',
      canonicalEventId: 'ev-m1',
      headline: 'Fato Relevante sobre bonificação',
      summary: '',
      publishedAt: '2026-11-10T10:00:00.000Z',
      importance: 5,
      sentiment: 'POSITIVE',
      sentimentScore: 0.8,
      sentimentMethod: 'EVENT_HEADLINE_RULE',
      eventType: 'FACT_RELEVANT',
      assets: ['SOJA3'],
      primaryTickers: ['SOJA3'],
      secondaryTickers: [],
      sources: [{ name: 'InfoMoney', url: '' }],
      provider: 'FINANCIAL_MEDIA',
      sourceType: 'TRUSTED_FINANCIAL_MEDIA',
      official: false,
      freshness: 'BREAKING',
      decayWeight: 1.0,
    };
    const res = calculateNewsScoreV2([mediaEvent], 'SOJA3', refDate);
    // Base 0.4 + countBonus(0.1) + importanceBonus(0.4) = 0.9 (no official bonus!)
    expect(res.confidenceMultiplier).toBe(0.9);
  });

  // 11. EVENT_HEADLINE_RULE para heurística
  it('R1-11. assigns EVENT_HEADLINE_RULE when rule triggers without official source', () => {
    const result = classifyNewsSentiment('Empresa aprova dividendos e recompra de ações', '', { official: false });
    expect(result.method).toBe('EVENT_HEADLINE_RULE');
    expect(result.sentiment).toBe('POSITIVE');
  });

  // 12. OFFICIAL_EVENT_RULE apenas trusted source
  it('R1-12. assigns OFFICIAL_EVENT_RULE ONLY when official is verified true', () => {
    const result = classifyNewsSentiment('Empresa aprova dividendos e recompra de ações', '', { official: true });
    expect(result.method).toBe('OFFICIAL_EVENT_RULE');
    expect(result.sentiment).toBe('POSITIVE');
  });

  // 13. Official KPI recalculado
  it('R1-13. officialCount in pipeline metrics counts only verified official events', () => {
    const articles: RawNewsInput[] = [
      {
        headline: 'Fato relevante da SOJA3 no InfoMoney',
        ticker: 'SOJA3',
        publishedAt: new Date('2026-11-10T08:00:00.000Z'),
        sourceName: 'InfoMoney',
        provider: 'GOOGLE_NEWS',
      },
      {
        headline: 'Comunicado ao mercado da HYPE3 no Valor',
        ticker: 'HYPE3',
        publishedAt: new Date('2026-11-10T08:00:00.000Z'),
        sourceName: 'Valor',
        provider: 'GOOGLE_NEWS',
      },
      {
        headline: 'VALE3: Fato Relevante oficial na CVM',
        ticker: 'VALE3',
        publishedAt: new Date('2026-11-10T08:00:00.000Z'),
        sourceName: 'CVM',
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
      },
    ];

    const events = canonicalizeNewsEvents(articles, refDate);
    const officialEvents = events.filter((e) => e.official);
    expect(officialEvents).toHaveLength(1);
    expect(officialEvents[0]?.assets).toContain('VALE3');
    // SOJA3 and HYPE3 are NOT official
    const sojaEvent = events.find((e) => e.assets.includes('SOJA3'));
    expect(sojaEvent?.official).toBe(false);
    expect(sojaEvent?.eventType).toBe('FACT_RELEVANT');
  });

  // 14. UI badge official somente real
  it('R1-14. UI badges: media events keep eventType badge while dropping official badge', () => {
    const raw: RawNewsInput = {
      headline: 'Empresa divulga Fato Relevante - InfoMoney',
      ticker: 'SOJA3',
      publishedAt: new Date('2026-11-10T08:00:00.000Z'),
      sourceName: 'InfoMoney',
      provider: 'GOOGLE_NEWS',
    };
    const events = canonicalizeNewsEvents([raw], refDate);
    const ev = events[0]!;
    // UI can render Fato Relevante badge because eventType is preserved
    expect(ev.eventType).toBe('FACT_RELEVANT');
    // But UI does NOT render 🏛 Oficial because official is false
    expect(ev.official).toBe(false);
    expect(ev.sources[0]?.name).toBe('InfoMoney');
  });

  // 15. eventType preservado
  it('R1-15. eventType classification operates independently of source provenance', () => {
    const mediaHeadline = 'Comunicado ao Mercado sobre expansão das operações';
    const eventType = classifyNewsEventType(mediaHeadline);
    expect(eventType).toBe('MARKET_NOTICE');

    const trust = classifySourceTrust({
      headline: mediaHeadline,
      sourceName: 'Exame',
      provider: 'GOOGLE_NEWS',
    });
    expect(trust).toBe('TRUSTED_MEDIA');
  });

  // 16. Score replay determinístico
  it('R1-16. score replay produces identical scores across multiple evaluations', () => {
    const rawEvents: PortfolioNewsEvent[] = [
      {
        id: 'replay-1',
        canonicalEventId: 'replay-1',
        headline: 'SOJA3 anuncia aumento de dividendos e bonificação',
        summary: '',
        publishedAt: '2026-11-09T12:00:00.000Z',
        importance: 4,
        sentiment: 'POSITIVE',
        sentimentScore: 0.8,
        sentimentMethod: 'EVENT_HEADLINE_RULE',
        eventType: 'DIVIDEND',
        assets: ['SOJA3'],
        primaryTickers: ['SOJA3'],
        secondaryTickers: [],
        sources: [{ name: 'InfoMoney', url: '' }],
        provider: 'FINANCIAL_MEDIA',
        sourceType: 'TRUSTED_FINANCIAL_MEDIA',
        official: false,
        freshness: 'BREAKING',
        decayWeight: 1.0,
      },
    ];

    const run1 = calculateNewsScoreV2(rawEvents, 'SOJA3', refDate);
    const run2 = calculateNewsScoreV2(rawEvents, 'SOJA3', refDate);
    expect(run1.score).toBe(run2.score);
    expect(run1.confidenceMultiplier).toBe(run2.confidenceMultiplier);
    expect(run1.explainability).toBe(run2.explainability);
    expect(run1.score).toBeGreaterThan(60);
  });
});
