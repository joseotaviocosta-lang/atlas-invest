/**
 * Deterministic CTI projector (ADR-311).
 *
 * Pure function: TaxIntelligenceContext × nowIso → TaxIntelligenceResponse.
 * Copies canonical values verbatim (exact decimal strings); performs no
 * arithmetic on money, no inference, no I/O, no provider calls.
 * Status never promotes upward: BLOCKED/PARTIAL/UNKNOWN stay non-CONFIRMED.
 */
import { lookupBlocker } from './blocker-catalog';
import type {
  CtiAction,
  CtiActionId,
  CtiBlocker,
  CtiFact,
  CtiSource,
  CtiStatus,
  TaxIntelligenceContext,
  TaxIntelligenceResponse,
} from './types';

const KNOWN_MONTHLY = ['COMPLETE', 'NO_ACTIVITY', 'PARTIAL', 'BLOCKED', 'EMPTY'] as const;
const KNOWN_ANNUAL = [
  'READY',
  'NO_ACTIVITY',
  'PARTIAL',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
] as const;

function severityRank(status: CtiStatus): number {
  switch (status) {
    case 'BLOCKED':
      return 4;
    case 'PARTIAL':
      return 3;
    case 'CONFIRMED':
      return 1;
    case 'UNKNOWN':
    default:
      return 0;
  }
}

function monthlyToStatus(monthlyStatus: string): CtiStatus {
  switch (monthlyStatus) {
    case 'BLOCKED':
      return 'BLOCKED';
    case 'PARTIAL':
      return 'PARTIAL';
    case 'COMPLETE':
    case 'NO_ACTIVITY':
      return 'CONFIRMED';
    default:
      return 'UNKNOWN';
  }
}

function annualToStatus(annualStatus: string): CtiStatus {
  switch (annualStatus) {
    case 'BLOCKED':
      return 'BLOCKED';
    case 'PARTIAL':
    case 'REQUIRES_CONFIRMATION':
      return 'PARTIAL';
    case 'READY':
    case 'NO_ACTIVITY':
      return 'CONFIRMED';
    default:
      return 'UNKNOWN';
  }
}

function worst(a: CtiStatus, b: CtiStatus): CtiStatus {
  return severityRank(a) >= severityRank(b) ? a : b;
}

interface StagedBlocker {
  code: string;
  entry: { category: CtiBlocker['category']; title: string; explanation: string };
  actionId: CtiActionId;
  priority: number;
}

export function projectTaxIntelligence(
  context: TaxIntelligenceContext,
  nowIso: string,
): TaxIntelligenceResponse {
  const facts: CtiFact[] = [];
  const staged: StagedBlocker[] = [];
  const actions: CtiAction[] = [];
  const limitations: string[] = [];
  const sources: CtiSource[] = [
    { kind: 'LEDGER', label: 'Livro-razão de transações' },
    { kind: 'TAX_ENGINE', label: 'Motor fiscal (apuração mensal)' },
  ];

  const monthlyKnown = (KNOWN_MONTHLY as readonly string[]).includes(context.monthly.status);
  const monthlyStatus = monthlyToStatus(context.monthly.status);
  let overall: CtiStatus = monthlyStatus;

  // --- Annual readiness (subject scope) ---
  if (context.annual) {
    const annualKnown = (KNOWN_ANNUAL as readonly string[]).includes(context.annual.overallStatus);
    const annualStatus = annualToStatus(context.annual.overallStatus);
    overall = worst(overall, annualStatus);
    sources.push({ kind: 'TAX_ENGINE', label: 'Prontidão anual IRPF' });
    if (!annualKnown) {
      overall = worst(overall, 'UNKNOWN');
    }
    for (const req of context.annual.requirements) {
      if (req.status === 'SATISFIED' || req.status === 'WAIVED') continue;
      const tier = context.annual.overallStatus === 'BLOCKED' ? 100 : 60;
      staged.push({
        code: req.requirementId,
        entry: {
          category: 'EVIDENCE_REQUIRED',
          title: req.title,
          explanation: req.description,
        },
        actionId: 'OPEN_ANNUAL_READINESS',
        priority: tier,
      });
    }
    const seenReasons = new Set<string>();
    for (const reason of context.annual.blockingReasons) {
      if (seenReasons.has(reason)) continue;
      seenReasons.add(reason);
      staged.push({
        code: 'ANNUAL_READINESS_BLOCKING_REASON',
        entry: {
          category: 'OTHER_CANONICAL_BLOCKER',
          title: 'Bloqueio na apuração anual',
          explanation: reason,
        },
        actionId: 'OPEN_ANNUAL_READINESS',
        priority: context.annual.overallStatus === 'BLOCKED' ? 100 : 60,
      });
    }
  }

  // --- Monthly quality issues + reason code (canonical codes only) ---
  for (const code of context.monthly.qualityIssues) {
    const { code: resolved, entry } = lookupBlocker(code);
    staged.push({
      code: resolved,
      entry: { category: entry.category, title: entry.title, explanation: entry.explanation },
      actionId: entry.actionId,
      priority: entry.priority,
    });
  }
  if (context.monthly.reasonCode) {
    const { code: resolved, entry } = lookupBlocker(context.monthly.reasonCode);
    staged.push({
      code: resolved,
      entry: { category: entry.category, title: entry.title, explanation: entry.explanation },
      actionId: entry.actionId,
      priority: Math.max(entry.priority, 60),
    });
  }
  if (!monthlyKnown) {
    overall = worst(overall, 'UNKNOWN');
  }

  // --- Explicit reconciliation blockers (fed, never inferred) ---
  for (const rb of context.reconciliationBlockers) {
    if (rb.code === 'UNKNOWN_EVENT_TYPE') {
      staged.push({
        code: `RECONCILIATION_UNKNOWN_EVENT_TYPE:${rb.assetTicker}`,
        entry: {
          category: 'UNKNOWN_OPERATION_CLASSIFICATION',
          title: `Evento de ${rb.assetTicker} sem tipo comprovado`,
          explanation: rb.detail,
        },
        actionId: 'OPEN_DATA_QUALITY',
        priority: 40,
      });
    } else if (rb.code === 'UNKNOWN_ORIGIN') {
      staged.push({
        code: `RECONCILIATION_UNKNOWN_ORIGIN:${rb.assetTicker}`,
        entry: {
          category: 'RECONCILIATION_BLOCKED',
          title: `Origem de saldo de ${rb.assetTicker} não comprovada`,
          explanation: rb.detail,
        },
        actionId: 'OPEN_DATA_QUALITY',
        priority: 40,
      });
    } else {
      staged.push({
        code: `RECONCILIATION_MISSING_EVENT_DATE:${rb.assetTicker}`,
        entry: {
          category: 'RECONCILIATION_BLOCKED',
          title: `Data oficial de evento de ${rb.assetTicker} ausente`,
          explanation: rb.detail,
        },
        actionId: 'OPEN_DATA_QUALITY',
        priority: 40,
      });
    }
  }

  // --- Cost coverage facts + nuance ---
  const { cost } = context;
  const incompleteTotal = cost.incompleteAssets + cost.partialAssets;
  facts.push({
    code: 'TAX_STATUS',
    label: 'Situação fiscal da competência',
    value: context.monthly.status,
    source: 'TAX_ENGINE',
  });
  facts.push({
    code: 'COST_DOCUMENTARY_COVERAGE',
    label: 'Cobertura documental de custo',
    value: `${cost.completeAssets} de ${cost.completeAssets + incompleteTotal} posições com cobertura completa`,
    source: 'COST_ASSESSMENT',
  });
  facts.push({
    code: 'CANONICAL_COST_STATUS',
    label: 'Custo canônico incompleto',
    value: `${cost.canonicalIncompleteAssets} posições`,
    source: 'COST_ASSESSMENT',
  });
  facts.push({
    code: 'RULE_SET_STATUS',
    label: 'Conjunto de regras',
    value: context.monthly.ruleSetVersion ?? 'ausente',
    source: 'TAX_ENGINE',
  });
  facts.push({
    code: 'REVIEW_REQUIRED_COUNT',
    label: 'Evidências aguardando confirmação',
    value: `${cost.reviewRequiredCount}`,
    source: 'EVIDENCE',
  });
  sources.push({ kind: 'VERIFIED_EVIDENCE', label: 'Evidências de custo verificadas' });

  if (incompleteTotal > 0) {
    const partialNote =
      cost.partialAssets > 0
        ? ` Incluindo ${cost.partialAssets} com cobertura documental parcial.`
        : '';
    staged.push({
      code: 'COST_DOCUMENTARY_INCOMPLETE',
      entry: {
        category: 'COST_BASIS_INCOMPLETE',
        title: `Custo documental incompleto em ${incompleteTotal} ${incompleteTotal === 1 ? 'posição' : 'posições'}`,
        explanation:
          'Há posições com unidades sem custo histórico comprovado. Adicione evidências para melhorar a qualidade dos cálculos futuros.' +
          partialNote,
      },
      actionId: 'REVIEW_POSITIONS',
      priority: 60,
    });
  }
  if (cost.reviewRequiredCount > 0) {
    staged.push({
      code: 'COST_EVIDENCE_REVIEW_REQUIRED',
      entry: {
        category: 'EVIDENCE_REQUIRED',
        title: 'Evidências aguardando confirmação',
        explanation:
          'Há evidências de custo enviadas para revisão. Confirme-as para que passem a compor a cobertura documental.',
      },
      actionId: 'REVIEW_COST_BASIS',
      priority: 60,
    });
  }
  // KCRE11 nuance: documentary complete but canonical tax cost still incomplete.
  // Wording is state-aware: with enrichment enabled, resolved cost may
  // complement the calculation where complete (PART J).
  const documentaryCompleteButTaxBlocked =
    cost.completeAssets > 0 && cost.canonicalIncompleteAssets > 0;
  if (documentaryCompleteButTaxBlocked) {
    facts.push({
      code: 'DOCUMENTARY_VS_TAX_COST',
      label: 'Cobertura documental × custo fiscal',
      value: context.cost.taxEnrichmentEnabled
        ? 'Há posições com cobertura documental completa cujo custo fiscal é complementado por evidência verificada onde a resolução é completa.'
        : 'Há posições com cobertura documental completa cujo custo fiscal canônico permanece incompleto.',
      source: 'COST_ASSESSMENT',
    });
  }

  // --- taxDue: copied verbatim only when the OVERALL response is CONFIRMED.
  // Monthly COMPLETE floored by annual BLOCKED/PARTIAL must not state amounts
  // (PART N: never summarize non-definitive numbers as liability).
  const mayStateAmount = overall === 'CONFIRMED';
  if (mayStateAmount && context.monthly.taxDue) {
    facts.push({
      code: 'TAX_DUE',
      label: 'Imposto apurado',
      value: `${context.monthly.taxDue.amount} ${context.monthly.taxDue.currency}`,
      source: 'TAX_ENGINE',
    });
  } else if (mayStateAmount) {
    limitations.push('Valor apurado indisponível no estado canônico.');
  }

  // --- Dedupe blockers (same code once; highest priority wins) ---
  const byCode = new Map<string, StagedBlocker>();
  for (const item of staged) {
    const prev = byCode.get(item.code);
    if (!prev || item.priority > prev.priority) byCode.set(item.code, item);
  }
  const blockers: CtiBlocker[] = [...byCode.values()]
    .sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code))
    .map((item) => ({
      code: item.code,
      category: item.entry.category,
      priority: item.priority,
      title: item.entry.title,
      explanation: item.entry.explanation,
    }));

  // --- Actions: one per blocker actionId (highest blocker priority), ordered ---
  const actionPriority = new Map<CtiActionId, number>();
  for (const item of byCode.values()) {
    const prev = actionPriority.get(item.actionId) ?? 0;
    if (item.priority > prev) actionPriority.set(item.actionId, item.priority);
  }
  const ACTION_LABELS: Record<CtiActionId, string> = {
    OPEN_TAX: 'Abrir apuração fiscal',
    OPEN_TAX_QUALITY: 'Ver pendências fiscais',
    REVIEW_COST_BASIS: 'Revisar evidências de custo',
    REVIEW_POSITIONS: 'Revisar posições',
    REVIEW_IMPORTS: 'Revisar importações',
    OPEN_DATA_QUALITY: 'Abrir qualidade dos dados',
    OPEN_REVIEWS: 'Abrir revisões',
    OPEN_PORTFOLIO: 'Abrir carteira',
    OPEN_ANNUAL_READINESS: 'Abrir prontidão anual',
    OPEN_OBLIGATION: 'Ver obrigação fiscal',
  };
  const seenActions = new Set<CtiActionId>();
  for (const item of [...byCode.values()].sort(
    (a, b) => b.priority - a.priority || a.code.localeCompare(b.code),
  )) {
    if (seenActions.has(item.actionId)) continue;
    seenActions.add(item.actionId);
    actions.push({
      actionId: item.actionId,
      label: ACTION_LABELS[item.actionId],
      priority: actionPriority.get(item.actionId) ?? item.priority,
    });
  }
  actions.sort((a, b) => b.priority - a.priority || a.actionId.localeCompare(b.actionId));

  // --- Limitations (only applicable ones) ---
  if (overall === 'BLOCKED' || overall === 'PARTIAL') {
    limitations.push('O Atlas não estima imposto quando faltam dados essenciais.');
  }
  if (documentaryCompleteButTaxBlocked) {
    limitations.push(
      context.cost.taxEnrichmentEnabled
        ? 'O custo complementado por evidência aplica-se somente onde a resolução é completa; o histórico canônico permanece incompleto.'
        : 'Evidências documentais de custo ainda não alimentam o motor tributário.',
    );
  }
  if (context.reconciliationBlockers.length > 0) {
    limitations.push(
      'Uma diferença de quantidade não é classificada como compra, venda ou transferência sem evidência.',
    );
  }
  for (const limitation of context.monthly.limitations) {
    limitations.push(`Limitação canônica: ${limitation}.`);
  }
  if (!context.freshness.lastReplayAt) {
    limitations.push('Os dados podem não refletir as informações mais recentes.');
  } else if (context.freshness.lastReplayAt < context.freshness.asOf) {
    limitations.push('Os dados podem não refletir as informações mais recentes.');
  }

  // --- Headline / summary (deterministic templates) ---
  const noActivity = context.monthly.status === 'NO_ACTIVITY';
  let headline: string;
  let summary: string;
  if (overall === 'BLOCKED') {
    headline = 'Cálculo tributário bloqueado';
    summary = `O Atlas ainda não possui dados suficientes para concluir a apuração de ${context.competence} com segurança.`;
  } else if (overall === 'PARTIAL') {
    headline = 'Apuração tributária parcial';
    summary =
      'Parte da apuração está disponível, mas existem pendências que impedem uma conclusão definitiva.';
  } else if (overall === 'CONFIRMED' && noActivity) {
    headline = 'Sem movimentação tributável';
    summary = `Não há fato gerador na competência ${context.competence} segundo o estado canônico atual.`;
  } else if (overall === 'CONFIRMED') {
    headline = 'Apuração tributária disponível';
    summary =
      'Os dados necessários para esta apuração estão disponíveis segundo o estado canônico atual.';
  } else {
    headline = 'Situação fiscal indeterminada';
    summary =
      'Não há dados suficientes para explicar esta situação com segurança. Revise as pendências de dados.';
    if (!actions.some((a) => a.actionId === 'OPEN_TAX_QUALITY')) {
      actions.push({ actionId: 'OPEN_TAX_QUALITY', label: ACTION_LABELS.OPEN_TAX_QUALITY, priority: 10 });
      actions.sort((a, b) => b.priority - a.priority || a.actionId.localeCompare(b.actionId));
    }
  }

  return Object.freeze({
    status: overall,
    headline,
    summary,
    facts: Object.freeze(facts),
    blockers: Object.freeze(blockers),
    actions: Object.freeze(actions),
    limitations: Object.freeze(limitations),
    sources: Object.freeze(sources),
    generatedAt: nowIso,
  });
}
