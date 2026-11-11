/**
 * Project Atlas — Daily News Intelligence & Material Event Prioritization (APP-16L)
 *
 * Deterministic materiality classification, daily news digest builder,
 * asset status derivation, and noise reduction.
 *
 * Core Principles:
 * 1. Materiality != Sentiment (e.g. Fraud is CRITICAL + NEGATIVE; Transformational M&A is HIGH + POSITIVE).
 * 2. Official != Material (Official means verified provenance, but routine filings/forms remain ROUTINE).
 * 3. Zero External AI / LLM (100% deterministic rules and keyword heuristics).
 * 4. Silence (NO_RECENT_NEWS) is NEVER penalized.
 */

import {
  AssetNewsDailyStatus,
  DailyNewsDigestItem,
  MaterialityClassification,
  NewsEventType,
  NewsFreshness,
  NewsImportance,
  NewsMateriality,
  NewsSourceType,
  PortfolioDailyNewsDigest,
  PortfolioNewsEvent,
} from './portfolio-news.types';

export interface NewsMaterialityInput {
  headline: string;
  summary?: string;
  eventType?: NewsEventType;
  official?: boolean;
  importance?: NewsImportance;
  freshness?: NewsFreshness;
  sourceType?: NewsSourceType;
  category?: string;
  subject?: string;
  species?: string;
}

/**
 * Deterministically classifies the materiality level of a news event.
 */
export function classifyNewsMateriality(input: NewsMaterialityInput): MaterialityClassification {
  const headline = (input.headline || '').trim();
  const summary = (input.summary || '').trim();
  const fullText = `${headline} ${summary}`.toLowerCase();
  const category = (input.category || '').toLowerCase();
  const subject = (input.subject || '').toLowerCase();
  const species = (input.species || '').toLowerCase();
  const eventType = input.eventType || 'OTHER';

  const reasons: string[] = [];

  // =========================================================================
  // 1. CRITICAL (Score 90-100) — Existential, insolvencies, corporate control, fraud
  // =========================================================================
  if (
    /recupera[cç][aã]o\s+judicial|fal[eê]ncia|concordata|autofal[eê]ncia/i.test(fullText) ||
    /pedido\s+de\s+recupera[cç][aã]o|homologa[cç][aã]o\s+de\s+recupera[cç][aã]o/i.test(fullText)
  ) {
    const reason = 'Pedido ou homologação de recuperação judicial / risco de insolvência';
    reasons.push(reason);
    return { level: 'CRITICAL', score: 98, reasons, primaryReason: reason };
  }

  if (
    /fraude|interven[cç][aã]o|rombo\s+cont[aá]bil|opera[cç][aã]o\s+da\s+pol[ií]cia\s+federal|busca\s+e\s+apreens[aã]o/i.test(fullText) ||
    /investiga[cç][aã]o\s+criminal|san[cç][aã]o\s+regulat[oó]ria\s+material/i.test(fullText)
  ) {
    const reason = 'Fraude contábil, intervenção regulatória ou investigação material';
    reasons.push(reason);
    return { level: 'CRITICAL', score: 95, reasons, primaryReason: reason };
  }

  if (
    /\bopa\b|oferta\s+p[uú]blica\s+de\s+aquisi[cç][aã]o|mudan[cç]a\s+de\s+controle|fechamento\s+de\s+capital|cancelamento\s+de\s+registro/i.test(fullText)
  ) {
    const reason = 'Oferta Pública de Aquisição (OPA), mudança de controle ou fechamento de capital';
    reasons.push(reason);
    return { level: 'CRITICAL', score: 94, reasons, primaryReason: reason };
  }

  if (/suspens[aã]o\s+de\s+negocia[cç][aã]o|delisting|exclus[aã]o\s+do\s+preg[aã]o/i.test(fullText)) {
    const reason = 'Suspensão de negociação ou exclusão de cotação em bolsa';
    reasons.push(reason);
    return { level: 'CRITICAL', score: 92, reasons, primaryReason: reason };
  }

  if (/calote|default\s+de\s+d[ií]vida|vencimento\s+antecipado\s+de\s+deb[eê]ntures|inadimpl[eê]ncia\s+cr[ií]tica/i.test(fullText)) {
    const reason = 'Inadimplência grave, default de dívida ou vencimento antecipado';
    reasons.push(reason);
    return { level: 'CRITICAL', score: 90, reasons, primaryReason: reason };
  }

  if (/liquida[cç][aã]o\s+do\s+fundo|despejo\s+de\s+im[oó]vel|rescis[aã]o\s+total\s+de\s+locat[aá]rio/i.test(fullText)) {
    const reason = 'Liquidação judicial de fundo imobiliário ou rescisão locatícia total';
    reasons.push(reason);
    return { level: 'CRITICAL', score: 90, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 2. ROUTINE (Score 0-14) — Bureaucratic administrative filings & forms
  // =========================================================================
  const isRoutineFiling =
    /informe\s+peri[oó]dico|informe\s+mensal|informe\s+trimestral\s+estruturado|comprovante\s+de\s+entrega/i.test(fullText) ||
    /calend[aá]rio\s+de\s+eventos|termo\s+de\s+fechamento|demonstrativo\s+de\s+governan[cç]a|c[oó]digo\s+de\s+conduta/i.test(fullText) ||
    /reapresenta[cç][aã]o|retifica[cç][aã]o|documento\s+substitutivo|vers[aã]o\s+substitutiva/i.test(fullText) ||
    category.includes('informe periódico') ||
    category.includes('calendário') ||
    subject.includes('comprovante') ||
    species.includes('rotina') ||
    /ata\s+da\s+reuni[aã]o\s+do\s+conselho\s+de\s+administra[cç][aã]o\s+extraordin[aá]ria\s+sem\s+pauta/i.test(fullText);

  // If it's a routine filing AND doesn't mention major catalyst keywords
  if (isRoutineFiling && !/(?:aquisi[cç][aã]o|fus[aã]o|recompra|dividendo|preju[ií]zo|lucro|balan[cç]o|emiss[aã]o|loca[cç][aã]o)/i.test(fullText)) {
    const reason = 'Documento regulatório periódico ou informe administrativo de rotina';
    reasons.push(reason);
    return { level: 'ROUTINE', score: 5, reasons, primaryReason: reason };
  }

  // Generic administrative notices with no material novelty
  if (eventType === 'REGULATORY' && /aviso\s+gen[eé]rico|informa[cç][oõ]es\s+cadastrais|atualiza[cç][aã]o\s+de\s+dados/i.test(fullText)) {
    const reason = 'Atualização cadastral ou formalidade regulatória sem novidade material';
    reasons.push(reason);
    return { level: 'ROUTINE', score: 8, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 3. HIGH (Score 70-89) — Corporate transformations, earnings, major capital ops
  // =========================================================================
  if (
    eventType === 'EARNINGS' ||
    /resultado\s+trimestral|divulga[cç][aã]o\s+de\s+resultados|balan[cç]o\s+do\s+\d+t\d+|lucro\s+l[ií]quido\s+de|ebitda|guidance/i.test(fullText)
  ) {
    const reason = 'Divulgação de resultados ou projeções corporativas (guidance)';
    reasons.push(reason);
    return { level: 'HIGH', score: 85, reasons, primaryReason: reason };
  }

  if (
    /recompra\s+de\s+a[cç][oõ]es|programa\s+de\s+recompra|novo\s+programa\s+de\s+recompra/i.test(fullText)
  ) {
    const reason = 'Aprovação de programa de recompra de ações / cotas';
    reasons.push(reason);
    return { level: 'HIGH', score: 82, reasons, primaryReason: reason };
  }

  if (
    eventType === 'ACQUISITION' ||
    /fus[aã]o|aquisi[cç][aã]o\s+relevante|acordo\s+de\s+combina[cç][aã]o|aquisi[cç][aã]o\s+estrat[eé]gica|compra\s+de\s+participa[cç][aã]o/i.test(fullText)
  ) {
    const reason = 'Aquisição estratégica, fusão ou combinação de negócios';
    reasons.push(reason);
    return { level: 'HIGH', score: 80, reasons, primaryReason: reason };
  }

  if (
    eventType === 'SALE' ||
    /desinvestimento\s+relevante|aliena[cç][aã]o\s+de\s+ativos|venda\s+de\s+participa[cç][aã]o\s+estrat[eé]gica/i.test(fullText)
  ) {
    const reason = 'Venda relevante de ativos ou desinvestimento estratégico';
    reasons.push(reason);
    return { level: 'HIGH', score: 79, reasons, primaryReason: reason };
  }

  // Material FII operations (Real Estate / Agribusiness)
  if (
    /aquisi[cç][aã]o\s+de\s+im[oó]vel|venda\s+de\s+im[oó]vel|nova\s+loca[cç][aã]o|vac[aâ]ncia\s+relevante|rescis[aã]o\s+de\s+contrato/i.test(fullText) ||
    /renegocia[cç][aã]o\s+de\s+cri|mudan[cç]a\s+de\s+gestor|mudan[cç]a\s+de\s+administrador|emiss[aã]o\s+de\s+cotas/i.test(fullText)
  ) {
    const reason = 'Movimentação relevante em carteira imobiliária, locação ou gestão de FII';
    reasons.push(reason);
    return { level: 'HIGH', score: 80, reasons, primaryReason: reason };
  }

  // Capital structure changes & capital events
  if (
    eventType === 'CAPITAL_EVENT' ||
    /aumento\s+de\s+capital|subscri[cç][aã]o\s+de\s+a[cç][oõ]es|bonifica[cç][aã]o\s+em\s+a[cç][oõ]es|desdobramento\s+de\s+a[cç][oõ]es/i.test(fullText)
  ) {
    const reason = 'Evento estrutural de capital (aumento de capital, subscrição ou bonificação)';
    reasons.push(reason);
    return { level: 'HIGH', score: 78, reasons, primaryReason: reason };
  }

  // Dividend disruption or extraordinary dividends
  if (
    /corte\s+de\s+dividendos|redu[cç][aã]o\s+de\s+proventos|dividendo\s+extraordin[aá]rio|distribui[cç][aã]o\s+extraordin[aá]ria/i.test(fullText)
  ) {
    const reason = 'Alteração relevante ou extraordinária na distribuição de proventos';
    reasons.push(reason);
    return { level: 'HIGH', score: 78, reasons, primaryReason: reason };
  }

  // Generic FACT_RELEVANT with corporate changes
  if (eventType === 'FACT_RELEVANT') {
    const reason = 'Fato relevante oficial corporativo sobre negócios ou estratégia';
    reasons.push(reason);
    return { level: 'HIGH', score: 75, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 4. MEDIUM (Score 40-69) — Ordinary dividends, market notices, assemblies
  // =========================================================================
  if (
    eventType === 'DIVIDEND' ||
    /aviso\s+aos\s+acionistas\s+—\s+dividendos|juros\s+sobre\s+capital\s+pr[oó]prio|pagamento\s+de\s+rendimentos|distribui[cç][aã]o\s+de\s+jcp/i.test(fullText)
  ) {
    const reason = 'Aviso ordinário sobre declaração ou pagamento de proventos';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 55, reasons, primaryReason: reason };
  }

  if (
    eventType === 'MARKET_NOTICE' ||
    /comunicado\s+ao\s+mercado|esclarecimento\s+[aà]\s+cvm|atualiza[cç][aã]o\s+operacional/i.test(fullText)
  ) {
    const reason = 'Comunicado ao mercado com esclarecimentos ou atualizações pontuais';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 50, reasons, primaryReason: reason };
  }

  if (
    eventType === 'ASSEMBLY' ||
    /assembleia\s+geral|convoca[cç][aã]o\s+de\s+ago|convoca[cç][aã]o\s+de\s+age/i.test(fullText)
  ) {
    const reason = 'Convocação ou deliberação de assembleia geral de acionistas/cotistas';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 48, reasons, primaryReason: reason };
  }

  if (eventType === 'MANAGEMENT_REPORT' || /relat[oó]rio\s+gerencial/i.test(fullText)) {
    const reason = 'Relatório gerencial com panorama de gestão e indicadores';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 45, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 5. LOW (Score 15-39) — Financial media commentary, price targets, chatter
  // =========================================================================
  if (
    /pre[cç]o-alvo|recomenda[cç][aã]o|rating|alta\s+do\s+dia|queda\s+do\s+dia|destaques\s+do\s+ibovespa|gr[aá]fico/i.test(fullText) ||
    /an[aá]lise\s+gr[aá]fica|ibovespa\s+hoje|o\s+que\s+esperar/i.test(fullText)
  ) {
    const reason = 'Notícia setorial, análise de mercado ou relatório de analistas';
    reasons.push(reason);
    return { level: 'LOW', score: 25, reasons, primaryReason: reason };
  }

  // Default fallback based on importance / officiality
  if (input.importance && input.importance >= 4) {
    const reason = 'Notícia corporativa de relevância intermediária';
    reasons.push(reason);
    return { level: 'HIGH', score: 70, reasons, primaryReason: reason };
  }

  if (input.official) {
    const reason = 'Comunicação oficial arquivada na CVM / B3';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 40, reasons, primaryReason: reason };
  }

  const reason = 'Notícia de mercado ou menção na imprensa financeira';
  reasons.push(reason);
  return { level: 'LOW', score: 20, reasons, primaryReason: reason };
}

/**
 * Builds the deterministic Daily News Digest from canonical events.
 */
export function buildDailyNewsDigest(
  events: PortfolioNewsEvent[],
  params?: {
    referenceDate?: Date;
    maxItems?: number;
  },
): PortfolioDailyNewsDigest {
  const referenceDate = params?.referenceDate ?? new Date();
  const maxItems = params?.maxItems ?? 10;
  const dateStr = referenceDate.toISOString().slice(0, 10);

  if (!events || events.length === 0) {
    return {
      date: dateStr,
      totalEvents: 0,
      materialEventsCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      routineCount: 0,
      affectedAssetsCount: 0,
      affectedAssets: [],
      items: [],
    };
  }

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let routineCount = 0;

  // Track all classified items
  interface EnrichedItem {
    event: PortfolioNewsEvent;
    materiality: MaterialityClassification;
  }

  const enriched: EnrichedItem[] = [];

  for (const ev of events) {
    const classification =
      ev.materiality && ev.materialityScore !== undefined && ev.materialityReason
        ? {
            level: ev.materiality,
            score: ev.materialityScore,
            reasons: [ev.materialityReason],
            primaryReason: ev.materialityReason,
          }
        : classifyNewsMateriality({
            headline: ev.headline,
            summary: ev.summary,
            eventType: ev.eventType,
            official: ev.official,
            importance: ev.importance,
            freshness: ev.freshness,
            sourceType: ev.sourceType,
          });

    if (classification.level === 'CRITICAL') criticalCount++;
    else if (classification.level === 'HIGH') highCount++;
    else if (classification.level === 'MEDIUM') mediumCount++;
    else if (classification.level === 'ROUTINE') routineCount++;

    enriched.push({ event: ev, materiality: classification });
  }

  const materialEventsCount = criticalCount + highCount + mediumCount;

  // Sorting hierarchy for Daily Digest:
  // 1. Materiality Level: CRITICAL (5) > HIGH (4) > MEDIUM (3) > LOW (2) > ROUTINE (1)
  // 2. Freshness: BREAKING (6) > VERY_RECENT (5) > RECENT (4) > CURRENT (3) > CONTEXT (2) > EXPIRED (1)
  // 3. Importance: 5 to 1
  // 4. Official provenance: true > false
  // 5. Published date desc
  // 6. Deterministic tie-breaker: ticker ASC, id ASC
  const materialityOrder: Record<NewsMateriality, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    ROUTINE: 1,
  };

  const freshnessOrder: Record<NewsFreshness, number> = {
    BREAKING: 6,
    VERY_RECENT: 5,
    RECENT: 4,
    CURRENT: 3,
    CONTEXT: 2,
    EXPIRED: 1,
  };

  // Filter candidate pool:
  // Prefer events <= 7d (BREAKING, VERY_RECENT, RECENT) and NOT ROUTINE unless no material events exist
  let candidates = enriched.filter(
    (item) => item.event.freshness === 'BREAKING' || item.event.freshness === 'VERY_RECENT' || item.event.freshness === 'RECENT',
  );

  // If few events in last 7 days, gracefully fall back to CURRENT (<= 30d) material items
  if (candidates.length === 0) {
    candidates = enriched.filter((item) => item.event.freshness !== 'EXPIRED');
  }

  // Filter out pure ROUTINE items from the top digest when higher material events exist
  const nonRoutine = candidates.filter((item) => item.materiality.level !== 'ROUTINE');
  const pool = nonRoutine.length > 0 ? nonRoutine : candidates;

  pool.sort((a, b) => {
    // 1. Materiality level desc
    const matDiff = materialityOrder[b.materiality.level] - materialityOrder[a.materiality.level];
    if (matDiff !== 0) return matDiff;

    // 2. Freshness desc
    const freshDiff = freshnessOrder[b.event.freshness] - freshnessOrder[a.event.freshness];
    if (freshDiff !== 0) return freshDiff;

    // 3. Importance desc
    if (b.event.importance !== a.event.importance) {
      return b.event.importance - a.event.importance;
    }

    // 4. Official trust
    if (b.event.official !== a.event.official) {
      return b.event.official ? 1 : -1;
    }

    // 5. Published date desc
    const timeA = new Date(a.event.publishedAt).getTime();
    const timeB = new Date(b.event.publishedAt).getTime();
    if (timeA !== timeB) return timeB - timeA;

    // 6. Tie-breaker
    const tickA = a.event.primaryTickers[0] || a.event.assets[0] || '';
    const tickB = b.event.primaryTickers[0] || b.event.assets[0] || '';
    if (tickA !== tickB) return tickA.localeCompare(tickB);

    return a.event.id.localeCompare(b.event.id);
  });

  const selectedPool = pool.slice(0, maxItems);
  const affectedAssetsSet = new Set<string>();

  const items: DailyNewsDigestItem[] = selectedPool.map((item) => {
    const ev = item.event;
    const ticker = ev.primaryTickers[0] || ev.assets[0] || 'MKT';
    for (const a of ev.assets) {
      affectedAssetsSet.add(a);
    }

    let radarImpact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = 'NEUTRAL';
    if (ev.sentiment === 'POSITIVE') radarImpact = 'POSITIVE';
    else if (ev.sentiment === 'NEGATIVE') radarImpact = 'NEGATIVE';

    const officialSource = ev.sources.find((s) => s.name === 'CVM' || s.name === 'B3');
    const canonicalUrl = officialSource?.url || ev.sources[0]?.url;

    return {
      id: `digest_${ev.id}`,
      canonicalEventId: ev.canonicalEventId || ev.id,
      ticker,
      assets: ev.assets,
      headline: ev.headline,
      summary: ev.summary,
      eventType: ev.eventType,
      materiality: item.materiality.level,
      materialityScore: item.materiality.score,
      materialityReason: item.materiality.primaryReason,
      sentiment: ev.sentiment,
      sentimentScore: ev.sentimentScore,
      official: ev.official,
      publishedAt: ev.publishedAt,
      sourceName: officialSource ? officialSource.name : ev.sources[0]?.name || 'Imprensa',
      canonicalUrl,
      sourcesCount: ev.sources.length,
      sources: ev.sources,
      radarImpact,
    };
  });

  return {
    date: dateStr,
    totalEvents: events.length,
    materialEventsCount,
    criticalCount,
    highCount,
    mediumCount,
    routineCount,
    affectedAssetsCount: affectedAssetsSet.size,
    affectedAssets: Array.from(affectedAssetsSet).sort(),
    items,
  };
}

/**
 * Derives the daily news monitoring status for a specific asset.
 */
export function deriveAssetDailyNewsStatus(
  ticker: string,
  events: PortfolioNewsEvent[],
  providerStatus?: {
    officialStatus?: string;
    fallbackActive?: boolean;
  },
): AssetNewsDailyStatus {
  const tick = ticker.toUpperCase().trim();

  // If provider completely failed and zero events
  if (
    providerStatus?.officialStatus === 'OFFICIAL_PROVIDER_UNAVAILABLE' &&
    (!events || events.length === 0)
  ) {
    return 'PROVIDER_UNAVAILABLE';
  }

  if (!events || events.length === 0) {
    return 'NO_RECENT_NEWS';
  }

  // Filter events relevant to this ticker
  const assetEvents = events.filter(
    (e) => e.primaryTickers.includes(tick) || e.secondaryTickers.includes(tick) || e.assets.includes(tick),
  );

  if (assetEvents.length === 0) {
    return 'NO_RECENT_NEWS';
  }

  // Check recent events (<= 7 days)
  const recentEvents = assetEvents.filter(
    (e) => e.freshness === 'BREAKING' || e.freshness === 'VERY_RECENT' || e.freshness === 'RECENT',
  );

  const evaluationPool = recentEvents.length > 0 ? recentEvents : assetEvents;

  let hasCriticalOrHigh = false;
  let hasMediumOrLow = false;
  let routineOnly = true;

  for (const ev of evaluationPool) {
    const mat = ev.materiality ?? classifyNewsMateriality(ev).level;
    if (mat === 'CRITICAL' || mat === 'HIGH') {
      hasCriticalOrHigh = true;
      routineOnly = false;
    } else if (mat === 'MEDIUM' || mat === 'LOW') {
      hasMediumOrLow = true;
      routineOnly = false;
    }
  }

  if (hasCriticalOrHigh) return 'MATERIAL_EVENT';
  if (hasMediumOrLow) return 'RECENT_NEWS';
  if (routineOnly) return 'ROUTINE_ONLY';

  return 'NO_RECENT_NEWS';
}
