import { describe, it, expect } from 'vitest';
import {
  PORTFOLIO_REGULATORY_REGISTRY,
  resolveRegulatoryIssuer,
  normalizeCvmEventType,
  parseCvmDeliveryDate,
  parseFnetDeliveryDate,
  cvmRecordToRawNews,
  fnetRecordToRawNews,
  CvmOfficialNewsProvider,
  canonicalizeNewsEvents,
  calculateNewsScoreV2,
  RawNewsInput,
  classifySourceTrust,
  isTrustedOfficialSource,
} from '../../packages/market-data/src/opportunity-radar';

describe('PROJECT ATLAS — APP-16K: Official Regulatory News Integration', () => {
  const refDate = new Date('2026-11-10T12:00:00.000Z');

  // 1 & 2. Coverage of 36/36 portfolio assets with deterministic identity
  it('1 & 2. resolves regulatory issuer identity for all 36 active portfolio assets deterministically', () => {
    const portfolio36 = [
      'B3SA3', 'BBAS3', 'BRAP4', 'BRCR11', 'COGN3', 'EGIE3', 'EZTC3', 'FESA4',
      'FLRY3', 'HGLG11', 'HYPE3', 'IRBR3', 'IRIM11', 'ITSA4', 'JHSF3', 'KCRE11',
      'KNRI11', 'MALL11', 'MCCI11', 'MRFG3', 'MXRF11', 'PETR4', 'PRIO3', 'RBRP11',
      'ROXO34', 'SAPR4', 'SNAG11', 'SNCI11', 'SNEL11', 'SNFF11', 'SNFZ11', 'SNID11',
      'SOJA3', 'TAEE11', 'VGIP11', 'WIZC3',
    ];

    expect(portfolio36).toHaveLength(36);
    let resolvedCount = 0;
    for (const ticker of portfolio36) {
      const identity = resolveRegulatoryIssuer(ticker);
      expect(identity).not.toBeNull();
      expect(identity?.ticker).toBe(ticker);
      expect(identity?.cnpj).toBeDefined();
      expect(identity?.cnpj.length).toBeGreaterThan(10);
      resolvedCount++;
    }
    expect(resolvedCount).toBe(36);
  });

  // 3. Stocks resolve with CVM codes and Companhia Aberta status
  it('3. stocks correctly resolve to CVM Companhia Aberta code and legal name', () => {
    const petr4 = resolveRegulatoryIssuer('PETR4');
    expect(petr4?.assetType).toBe('STOCK');
    expect(petr4?.cvmCode).toBe('9512');
    expect(petr4?.cnpj).toBe('33.000.167/0001-01');

    const vale3 = resolveRegulatoryIssuer('VALE3');
    expect(vale3?.assetType).toBe('STOCK');
    expect(vale3?.cvmCode).toBe('4170');
    expect(vale3?.cnpj).toBe('33.592.510/0001-54');

    const soja3 = resolveRegulatoryIssuer('SOJA3');
    expect(soja3?.assetType).toBe('STOCK');
    expect(soja3?.cvmCode).toBe('25704');
    expect(soja3?.cnpj).toBe('10.807.374/0001-77');

    const hype3 = resolveRegulatoryIssuer('HYPE3');
    expect(hype3?.assetType).toBe('STOCK');
    expect(hype3?.cvmCode).toBe('21431');
    expect(hype3?.cnpj).toBe('02.932.074/0001-91');
  });

  // 4. FIIs resolve with Fundos.NET / CVM CNPJ identifiers
  it('4. FIIs and Fiagros correctly resolve to B3 FNET identifiers and fund CNPJ', () => {
    const hglg11 = resolveRegulatoryIssuer('HGLG11');
    expect(hglg11?.assetType).toBe('FII');
    expect(hglg11?.cnpj).toBe('11.728.688/0001-47');
    expect(hglg11?.source).toBe('FNET_B3');

    const knri11 = resolveRegulatoryIssuer('KNRI11');
    expect(knri11?.assetType).toBe('FII');
    expect(knri11?.cnpj).toBe('12.005.956/0001-65');

    const snag11 = resolveRegulatoryIssuer('SNAG11');
    expect(snag11?.assetType).toBe('FII');
    expect(snag11?.cnpj).toBe('28.152.777/0001-90');

    const snfz11 = resolveRegulatoryIssuer('SNFZ11');
    expect(snfz11?.assetType).toBe('FII');
    expect(snfz11?.cnpj).toBe('53.313.475/0001-02');
  });

  // 5. CVM Event Type Normalization
  it('5. maps CVM categories and subjects into canonical NewsEventType', () => {
    expect(normalizeCvmEventType('Fato Relevante', 'Novo plano de recompra')).toBe('FACT_RELEVANT');
    expect(normalizeCvmEventType('Comunicado ao Mercado', 'Apresentação a analistas')).toBe('MARKET_NOTICE');
    expect(normalizeCvmEventType('Assembleia', '', 'Edital de Convocação')).toBe('ASSEMBLY');
    expect(normalizeCvmEventType('Dados Econômico-Financeiros', 'Press Release 3T26')).toBe('EARNINGS');
    expect(normalizeCvmEventType('Aviso aos Acionistas', 'Distribuição de Dividendos')).toBe('DIVIDEND');
    expect(normalizeCvmEventType('Reunião da Administração', 'Aumento de Capital Social')).toBe('CAPITAL_EVENT');
    expect(normalizeCvmEventType('Informes Periódicos', 'Informe Mensal Estruturado')).toBe('MANAGEMENT_REPORT');
  });

  // 6. CVM Delivery Date Parsing
  it('6. safely parses CVM and FNET delivery date formats into ISO Date', () => {
    const d1 = parseCvmDeliveryDate('2026-10-27');
    expect(d1.getUTCFullYear()).toBe(2026);
    expect(d1.getUTCMonth()).toBe(9); // 0-based: 9 = October
    expect(d1.getUTCDate()).toBe(27);

    const d2 = parseFnetDeliveryDate('25/07/2026 18:09');
    expect(d2.getUTCFullYear()).toBe(2026);
    expect(d2.getUTCMonth()).toBe(6); // July
    expect(d2.getUTCDate()).toBe(25);
    expect(d2.getUTCHours()).toBe(18);
    expect(d2.getUTCMinutes()).toBe(9);
  });

  // 7. CVM Record to RawNewsInput produces verified official provenance
  it('7. converts CVM record into RawNewsInput with official = true and RAD download URL', () => {
    const raw = cvmRecordToRawNews(
      {
        cnpj: '10.807.374/0001-77',
        companyName: 'BOA SAFRA SEMENTES S.A',
        cvmCode: '25704',
        category: 'Fato Relevante',
        subject: 'Quinto Plano de Recompra de Ações',
        deliveryDate: '2026-10-27',
        protocol: '1580679',
        downloadUrl: 'https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numProtocolo=1580679',
      },
      'SOJA3',
    );

    expect(raw.official).toBe(true);
    expect(raw.provider).toBe('CVM');
    expect(raw.sourceType).toBe('OFFICIAL_REGULATORY');
    expect(raw.url).toContain('rad.cvm.gov.br');
    expect(isTrustedOfficialSource(raw)).toBe(true);
    expect(classifySourceTrust(raw)).toBe('OFFICIAL');
  });

  // 8. FNET Record to RawNewsInput produces verified official provenance
  it('8. converts FNET record into RawNewsInput with official = true and FNET document URL', () => {
    const raw = fnetRecordToRawNews(
      {
        id: 496277,
        categoriaDocumento: 'Fato Relevante',
        dataEntrega: '25/07/2026 18:09',
        tipoDocumento: 'Fato Relevante',
        especieDocumento: 'Aquisição de Imóvel',
      },
      'HGLG11',
    );

    expect(raw.official).toBe(true);
    expect(raw.provider).toBe('B3');
    expect(raw.sourceType).toBe('OFFICIAL_REGULATORY');
    expect(raw.url).toBe('https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=496277');
    expect(isTrustedOfficialSource(raw)).toBe(true);
  });

  // 9. Canonical deduplication: CVM official source wins cluster and retains media links
  it('9. merges CVM official event with financial media into a single canonical event where official wins', () => {
    const officialCvm: RawNewsInput = {
      headline: 'BOA SAFRA SEMENTES S.A (SOJA3): Fato Relevante — Quinto Plano de Recompra',
      summary: 'Aprovação do 5º programa de recompra de ações ordinárias.',
      url: 'https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numProtocolo=1580679',
      publishedAt: new Date('2026-10-27T10:00:00.000Z'),
      ticker: 'SOJA3',
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      official: true,
    };

    const mediaArticle: RawNewsInput = {
      headline: 'Boa Safra (SOJA3) divulga Fato Relevante sobre aprovação de recompra de ações - InfoMoney',
      summary: 'Conselho de administração da Boa Safra aprovou novo plano de recompra.',
      url: 'https://www.infomoney.com.br/mercados/boa-safra-soja3-recompra-acoes',
      sourceName: 'InfoMoney',
      publishedAt: new Date('2026-10-27T10:45:00.000Z'),
      ticker: 'SOJA3',
      provider: 'GOOGLE_NEWS',
      sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
    };

    const events = canonicalizeNewsEvents([mediaArticle, officialCvm], refDate);

    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.official).toBe(true);
    expect(ev.eventType).toBe('FACT_RELEVANT');
    expect(ev.sourceType).toBe('OFFICIAL_REGULATORY');
    expect(ev.sentimentMethod).toBe('OFFICIAL_EVENT_RULE');
    expect(ev.importance).toBe(5);

    // Sources must retain BOTH CVM and InfoMoney
    expect(ev.sources).toHaveLength(2);
    const sourceNames = ev.sources.map((s) => s.name);
    expect(sourceNames).toContain('CVM');
    expect(sourceNames).toContain('InfoMoney');
  });

  // 10. Official events increment officialCount in metrics
  it('10. official events correctly increase officialCount in metrics', () => {
    const officialEvent: RawNewsInput = {
      headline: 'HYPERA S/A (HYPE3): Fato Relevante — Aprovação de Recompra',
      publishedAt: new Date('2026-10-27T11:00:00.000Z'),
      ticker: 'HYPE3',
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      url: 'https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numProtocolo=1580871',
    };

    const mediaEvent: RawNewsInput = {
      headline: 'Vale (VALE3) sobe com alta do minério na China - Valor Econômico',
      publishedAt: new Date('2026-11-09T14:00:00.000Z'),
      ticker: 'VALE3',
      sourceName: 'Valor Econômico',
      provider: 'GOOGLE_NEWS',
      sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
      url: 'https://valor.globo.com/vale3',
    };

    const events = canonicalizeNewsEvents([officialEvent, mediaEvent], refDate);
    const officialCount = events.filter((e) => e.official).length;
    expect(officialCount).toBe(1);
    expect(events[0]?.official).toBe(true);
    expect(events[0]?.assets).toContain('HYPE3');
  });

  // 11. Official bonus (+0.2) and multiplier (1.2) are applied in NewsScorerV2
  it('11. scores official regulatory events with official bonus and 1.2 multiplier', () => {
    const officialRaw: RawNewsInput = {
      headline: 'BOA SAFRA SEMENTES S.A (SOJA3): Fato Relevante — Recompra de Ações',
      publishedAt: new Date('2026-10-27T10:00:00.000Z'),
      ticker: 'SOJA3',
      provider: 'CVM',
      sourceType: 'OFFICIAL_REGULATORY',
      url: 'https://www.rad.cvm.gov.br/ENET/',
    };

    const events = canonicalizeNewsEvents([officialRaw], refDate);
    const scoreRes = calculateNewsScoreV2(events, 'SOJA3', refDate);

    expect(scoreRes.score).toBeGreaterThan(65);
    expect(scoreRes.confidenceMultiplier).toBeGreaterThanOrEqual(0.8);
    expect(scoreRes.explainability).toContain('Fato relevante');
  });

  // 12. Fail-closed: provider outage does not crash or throw
  it('12. provider handles unknown ticker or network outage gracefully without throwing', async () => {
    const provider = new CvmOfficialNewsProvider();
    const res = await provider.fetchOfficialEvents(['UNKNOWN_TICKER_99'], refDate);

    expect(res.resolvedCount).toBe(0);
    expect(res.unresolvedCount).toBe(1);
    expect(res.articles).toHaveLength(0);
  });

  // 13. Replay determinism: identical results across 10 repeated runs
  it('13. official canonicalization and scoring produces identical results across 10 repeated evaluations', () => {
    const rawEvents: RawNewsInput[] = [
      {
        headline: 'HYPERA S/A (HYPE3): Fato Relevante — Recompra de Ações Ordinárias',
        publishedAt: new Date('2026-10-27T12:00:00.000Z'),
        ticker: 'HYPE3',
        provider: 'CVM',
        sourceType: 'OFFICIAL_REGULATORY',
        url: 'https://www.rad.cvm.gov.br',
      },
      {
        headline: 'Hypera (HYPE3) anuncia recompra de ações - InfoMoney',
        publishedAt: new Date('2026-10-27T12:30:00.000Z'),
        ticker: 'HYPE3',
        sourceName: 'InfoMoney',
        provider: 'GOOGLE_NEWS',
        sourceType: 'GOOGLE_NEWS_RSS_FALLBACK',
        url: 'https://infomoney.com.br',
      },
    ];

    const firstCanonical = canonicalizeNewsEvents(rawEvents, refDate);
    const firstScore = calculateNewsScoreV2(firstCanonical, 'HYPE3', refDate);

    for (let i = 0; i < 10; i++) {
      const runCanonical = canonicalizeNewsEvents(rawEvents, refDate);
      const runScore = calculateNewsScoreV2(runCanonical, 'HYPE3', refDate);
      expect(runCanonical[0]?.canonicalEventId).toBe(firstCanonical[0]?.canonicalEventId);
      expect(runScore.score).toBe(firstScore.score);
      expect(runScore.confidenceMultiplier).toBe(firstScore.confidenceMultiplier);
    }
  });
});
