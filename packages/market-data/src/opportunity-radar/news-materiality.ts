/**
 * Project Atlas — Daily News Intelligence & Material Event Prioritization (APP-16L / APP-16L-R1)
 *
 * Deterministic materiality classification, daily news digest builder,
 * asset status derivation, and noise reduction.
 *
 * Core Principles:
 * 1. Materiality != Sentiment (e.g. Fraud is CRITICAL + NEGATIVE; Transformational M&A is HIGH + POSITIVE).
 * 2. Official != Material (Official means verified provenance, but routine filings/forms remain ROUTINE or LOW).
 * 3. Zero External AI / LLM (100% deterministic rules and keyword heuristics).
 * 4. Silence (NO_RECENT_NEWS) is NEVER penalized.
 * 5. Earnings Schedule vs Actual: Previews/calendars are LOW (25); Actual reports with metrics/numbers are HIGH (85).
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
} from './portfolio-news.types.js';

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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Deterministically classifies the materiality level of a news event (APP-16L-R1 Refinement).
 */
export function classifyNewsMateriality(input: NewsMaterialityInput): MaterialityClassification {
  const headline = (input.headline || '').trim();
  const summary = (input.summary || '').trim();
  const normHeadline = normalizeText(headline);
  const normSummary = normalizeText(summary);
  const fullText = `${headline} ${summary}`.toLowerCase();
  const normFullText = `${normHeadline} ${normSummary}`;
  const category = (input.category || '').toLowerCase();
  const subject = (input.subject || '').toLowerCase();
  const species = (input.species || '').toLowerCase();
  const eventType = input.eventType || 'OTHER';

  const reasons: string[] = [];

  // =========================================================================
  // 1. ROUTINE PRE-FILTER (Score 0-14) — Bureaucratic & Periodic Compliance Filings
  // Art. 11/12 insider trading forms, English translated DFs, routine notices, committee resignations
  // =========================================================================
  const isPeriodicCompliance =
    // CVM Art. 11 & Art. 12 insider trading/shareholder position notices
    /art\.?\s*11|art\.?\s*12|valores mobiliarios negociados e detidos|negociacao de administradores/i.test(normFullText) ||
    // Translated corporate documents (Demonstrações Financeiras em Inglês, Versão em Inglês, etc.)
    /demonstracoes financeiras padronizadas em ingles|versao em ingles|english version|dfp em ingles|itr em ingles/i.test(normFullText) ||
    // Internal audit reports, advisory presentations without actual financial metric disclosure
    /assessoria de auditoria interna|relatorio executivo de gerenciamento de riscos|diagnostico de aderencia|revisao do regimento interno da auditoria/i.test(normFullText) ||
    // Routine calendar / corporate event notifications
    /calendario de eventos corporativos|comunicacao sobre informacoes trimestrais|entrega das informacoes trimestrais/i.test(normFullText) ||
    // Pure administrative filings & committee secretariat
    /termo de posse|renuncia de membro de comite|eleicao de membros de comite|comite de auditoria estatutario/i.test(normFullText) ||
    // CVM form filings (FCA, IPE cadastral updates)
    /formulario cadastral|formulario de referencia|atualizacao cadastral cvm/i.test(normFullText);

  if (isPeriodicCompliance && !/fraude|falencia|recuperacao judicial|opa\b/i.test(normFullText)) {
    const reason = 'Comunicação administrativa ou regulatória periódica rotineira (sem impacto econômico relevante)';
    reasons.push(reason);
    return { level: 'ROUTINE', score: 5, reasons, primaryReason: reason };
  }

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
  // 2. CRITICAL (Score 90-100) — Existential, insolvencies, corporate control, fraud
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
  // 3. EARNINGS CONTEXT: DISTINGUISH ACTUAL EARNINGS VS SCHEDULE / PREVIEWS
  // Calendar / Expectation / Watchlist -> LOW (25)
  // Actual Results / DFP / ITR with metrics -> HIGH (85)
  // =========================================================================
  const isEarningsContext =
    eventType === 'EARNINGS' ||
    /balanco|resultado|lucro|prejuizo|ebitda|receita liquida|itr|dfp|demonstracoes financeiras/i.test(normFullText);

  if (isEarningsContext) {
    const isEarningsSchedule =
      /veja quais empresas|calendario de resultados|agenda de resultados|divulgam nesta semana|divulga nesta semana|divulgam hoje|divulga hoje|temporada de balancos comeca|o que esperar do|previa do resultado|previa 3t|previa 4t|previa 1t|previa 2t|estimativas para/i.test(normFullText) &&
      !/lucro liquido de r\$|prejuizo liquido de r\$|ebitda atinge r\$|receita cresce|lucro salta|lucro cai|tem alta de \d+% no lucro|registra lucro/i.test(normFullText);

    if (isEarningsSchedule) {
      const reason = 'Calendário, expectativa ou agenda de divulgação de resultados corporativos';
      reasons.push(reason);
      return { level: 'LOW', score: 25, reasons, primaryReason: reason };
    }

    const isEarningsActual =
      eventType === 'EARNINGS' ||
      /divulgacao de resultados|apresentacao para analistas|demonstracoes financeiras padronizadas|informacoes trimestrais/i.test(normFullText) ||
      (/lucro liquido|prejuizo liquido|ebitda|receita liquida/i.test(normFullText) &&
       (/divulga resultado|divulga balanco|reporta lucro|reporta prejuizo|lucro sobe|lucro cai|lucro cresce|alta de \d+%|queda de \d+%|atinge r\$|r\$\s*\d+/i.test(normFullText)));

    if (isEarningsActual) {
      const reason = 'Divulgação oficial de resultados trimestrais/anuais ou métricas financeiras consolidadas';
      reasons.push(reason);
      return { level: 'HIGH', score: 85, reasons, primaryReason: reason };
    }
  }

  // =========================================================================
  // 4. HIGH (Score 70-89) — Corporate transformations, buybacks, major capital ops
  // =========================================================================
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

  // -------------------------------------------------------------------------
  // FII Material Operations (Real Estate / Agribusiness)
  // -------------------------------------------------------------------------
  const isFiiRealEstateOp =
    /aquisicao de imovel|venda de imovel|nova locacao|locacao de|vacancia relevante|aumento de vacancia|devolucao de|rescisao de contrato/i.test(normFullText) ||
    /renegociacao de cri|mudanca de gestor|mudanca de administrador|emissao de cotas/i.test(normFullText);

  if (isFiiRealEstateOp) {
    const reason = 'Movimentação relevante em carteira imobiliária, locação ou gestão de FII';
    reasons.push(reason);
    return { level: 'HIGH', score: 80, reasons, primaryReason: reason };
  }

  // Substantive FACT_RELEVANT with catalyst keywords or strategic business discoveries/announcements
  if (eventType === 'FACT_RELEVANT') {
    const isSubstantiveFact =
      /descoberta|nova concessao|parceria estrategica|contrato relevante|acordo de leniencia|encerramento de disputa|acordo de acionistas/i.test(normFullText) ||
      /investimento de r\$|aporte de r\$|emissao de debentures|oferta publica/i.test(normFullText);

    if (isSubstantiveFact) {
      const reason = 'Fato Relevante com impacto operacional, societário ou financeiro relevante';
      reasons.push(reason);
      return { level: 'HIGH', score: 75, reasons, primaryReason: reason };
    }

    const reason = 'Fato Relevante ou comunicação oficial comunicada ao mercado';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 50, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 5. ASSEMBLEIAS GERAIS: EXTRAORDINARY (AGE) VS ORDINARY (AGO)
  // Reorganization / Transformation -> HIGH (70)
  // Ordinary / Routine approval of financial statements -> LOW (25)
  // =========================================================================
  if (eventType === 'ASSEMBLY' || /assembleia geral|convocacao.*assembleia|ata da assembleia/i.test(normFullText)) {
    const isTransformativeAssembly =
      /assembleia geral extraordinaria|age|fusao|incorporacao|cisao|aumento de capital|reforma de estatuto/i.test(normFullText);

    if (isTransformativeAssembly) {
      const reason = 'Convocação ou deliberação de Assembleia Geral Extraordinária (mudança estatutária ou societária)';
      reasons.push(reason);
      return { level: 'HIGH', score: 70, reasons, primaryReason: reason };
    }

    const reason = 'Convocação ou ata de Assembleia Geral Ordinária (aprovação rotineira de contas / demonstrações)';
    reasons.push(reason);
    return { level: 'LOW', score: 25, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 6. MEDIUM (Score 40-69) — Ordinary dividends, market notices, management changes
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

  const isGovernanceOrManagement =
    /eleicao de diretor presidente|mudanca de ceo|novo diretor financeiro|novo cfo|eleicao do conselho de administracao/i.test(normFullText);

  if (isGovernanceOrManagement) {
    const reason = 'Alteração em liderança executiva (CEO/CFO) ou composição do Conselho de Administração';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 60, reasons, primaryReason: reason };
  }

  const isCreditRatingUpdate =
    /elevacao de rating|rebaixamento de rating|nota de credito|classificacao de risco|fitch|moody'?s|s&p/i.test(normFullText);

  if (isCreditRatingUpdate) {
    const reason = 'Revisão ou atualização de classificação de crédito / rating corporativo';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 55, reasons, primaryReason: reason };
  }

  const isOperationalMilestone =
    /inauguracao de fabrica|novo contrato de fornecimento|autorizacao regulatoria|licenca ambiental|novo produto/i.test(normFullText);

  if (isOperationalMilestone) {
    const reason = 'Marco operacional ou regulatório de impacto moderado nos negócios';
    reasons.push(reason);
    return { level: 'MEDIUM', score: 45, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 7. LOW (Score 15-39) — Financial media commentary, price targets, chatter, FII reports
  // =========================================================================
  if (
    /pre[cç]o-alvo|recomenda[cç][aã]o|alta\s+do\s+dia|queda\s+do\s+dia|destaques\s+do\s+ibovespa|gr[aá]fico/i.test(fullText) ||
    /an[aá]lise\s+gr[aá]fica|ibovespa\s+hoje|o\s+que\s+esperar/i.test(fullText) ||
    eventType === 'MANAGEMENT_REPORT' ||
    /relat[oó]rio\s+gerencial/i.test(fullText)
  ) {
    const reason = 'Notícia setorial, análise de mercado, recomendação ou relatório gerencial rotineiro';
    reasons.push(reason);
    return { level: 'LOW', score: 25, reasons, primaryReason: reason };
  }

  // =========================================================================
  // 8. DEFAULT FALLBACK
  // Unclassified notices without material triggers default to LOW or ROUTINE.
  // Never default official filings directly to MEDIUM or HIGH.
  // =========================================================================
  if (input.official) {
    const reason = 'Comunicação oficial arquivada na CVM / B3 sem gatilho de materialidade identificado';
    reasons.push(reason);
    return { level: 'LOW', score: 20, reasons, primaryReason: reason };
  }

  const reason = 'Notícia de mercado ou menção na imprensa com impacto fundamental não material';
  reasons.push(reason);
  return { level: 'LOW', score: 18, reasons, primaryReason: reason };
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
      attentionEventsCount: 0,
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
  const attentionEventsCount = criticalCount + highCount;

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
    attentionEventsCount,
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
