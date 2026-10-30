/**
 * Phase 5K-HV-R1 — pure review-decision model for the Import Hub.
 *
 * Server preview statuses are advisory. Confirmation eligibility is derived
 * exclusively from EFFECTIVE user decisions:
 * - skipped rows never block and are never written;
 * - auto-skipped rows (duplicates, unsupported) never block;
 * - resolution rows become importable only when asset AND account resolve;
 * - probable duplicates require an explicit force-import choice;
 * - conflicts, future dates and invalid rows can only be skipped.
 *
 * No floats, no dates, no I/O — pure row-state reduction.
 */

export type EffectiveRowState = 'importable' | 'skipped' | 'auto_skipped' | 'blocked';

export interface ReviewCandidateLike {
  status: 'READY' | 'DUPLICATE' | 'AMBIGUOUS_ASSET' | 'INVALID' | 'UNSUPPORTED' | 'NEEDS_REVIEW';
  issues: Array<{ code: string }>;
  assetId: string | null;
  accountId: string | null;
  duplicate: 'NEW' | 'EXACT_DUPLICATE' | 'PROBABLE_DUPLICATE' | 'CONFLICT';
}

export interface ReviewDecision {
  skipped: boolean;
  assetOverrideId?: string;
  accountOverrideId?: string;
  forceImport: boolean;
}

export interface EffectiveRow {
  state: EffectiveRowState;
  reason: string | null;
}

const RESOLUTION_ISSUE_CODES = new Set(['UNKNOWN_ASSET', 'AMBIGUOUS_ASSET', 'ACCOUNT_REQUIRED']);

export function getEffectiveRowState(
  candidate: ReviewCandidateLike,
  decision: ReviewDecision,
): EffectiveRow {
  if (decision.skipped) {
    return { state: 'skipped', reason: null };
  }
  if (candidate.status === 'READY') {
    return { state: 'importable', reason: null };
  }
  if (candidate.status === 'DUPLICATE') {
    return { state: 'auto_skipped', reason: 'Operação já existe no livro-razão' };
  }
  if (candidate.status === 'UNSUPPORTED') {
    return { state: 'auto_skipped', reason: 'Tipo de operação ainda não suportado' };
  }
  if (candidate.status === 'INVALID') {
    return { state: 'blocked', reason: 'Linha inválida: corrija o arquivo ou ignore a linha' };
  }
  if (candidate.duplicate === 'CONFLICT') {
    return {
      state: 'blocked',
      reason: 'Identificador externo com valores divergentes: ignore a linha',
    };
  }
  if (candidate.duplicate === 'PROBABLE_DUPLICATE') {
    if (decision.forceImport) {
      return { state: 'importable', reason: null };
    }
    return {
      state: 'blocked',
      reason: 'Possível duplicada: ignore a linha ou marque "Importar mesmo assim"',
    };
  }
  const onlyResolutionIssues =
    candidate.issues.length > 0 &&
    candidate.issues.every((issue) => RESOLUTION_ISSUE_CODES.has(issue.code));
  if (!onlyResolutionIssues) {
    return { state: 'blocked', reason: 'Linha precisa de revisão: ignore a linha' };
  }
  const assetOk = candidate.assetId !== null || (decision.assetOverrideId ?? '') !== '';
  const accountOk = candidate.accountId !== null || (decision.accountOverrideId ?? '') !== '';
  if (assetOk && accountOk) {
    return { state: 'importable', reason: null };
  }
  return { state: 'blocked', reason: 'Resolva ativo e conta, ou ignore a linha' };
}

export interface ConfirmEligibility {
  importableCount: number;
  blockedCount: number;
  skippedCount: number;
  autoSkippedCount: number;
  canConfirm: boolean;
  hint: string | null;
}

export function getConfirmEligibility(
  rows: Array<{ candidate: ReviewCandidateLike; decision: ReviewDecision }>,
): ConfirmEligibility {
  let importableCount = 0;
  let blockedCount = 0;
  let skippedCount = 0;
  let autoSkippedCount = 0;
  for (const row of rows) {
    const effective = getEffectiveRowState(row.candidate, row.decision);
    if (effective.state === 'importable') importableCount += 1;
    else if (effective.state === 'blocked') blockedCount += 1;
    else if (effective.state === 'skipped') skippedCount += 1;
    else autoSkippedCount += 1;
  }
  if (blockedCount > 0) {
    return {
      importableCount,
      blockedCount,
      skippedCount,
      autoSkippedCount,
      canConfirm: false,
      hint: `Resolva ou ignore ${blockedCount === 1 ? 'a linha pendente' : `as ${blockedCount} linhas pendentes`} para confirmar.`,
    };
  }
  if (importableCount === 0) {
    return {
      importableCount,
      blockedCount,
      skippedCount,
      autoSkippedCount,
      canConfirm: false,
      hint: 'Nenhuma operação será importada. Revise as decisões ou escolha outro arquivo.',
    };
  }
  return {
    importableCount,
    blockedCount,
    skippedCount,
    autoSkippedCount,
    canConfirm: true,
    hint: null,
  };
}

/**
 * Phase R1 hotfix — client-side source hint for the Import Hub.
 *
 * Filename sniffing is a UX hint only: the backend re-detects the layout from
 * the file bytes and remains the source of truth (detection wins for parsing
 * and safety gates). Recognizes `movimentacao-` / `movimentação-` prefixes.
 */
export type ClientSourceType =
  | 'GENERIC_CSV'
  | 'B3_NEGOTIATION_XLSX'
  | 'B3_ANNUAL_REPORT_XLSX'
  | 'B3_MOVEMENT_XLSX';

export interface ClientSourceHint {
  sourceType: ClientSourceType;
  formatName: string | null;
}

export function detectClientSourceType(fileName: string, isXlsx: boolean): ClientSourceHint {
  if (!isXlsx) {
    return { sourceType: 'GENERIC_CSV', formatName: null };
  }
  const lowered = fileName.toLowerCase();
  if (lowered.includes('anual') || lowered.includes('consolidado')) {
    return {
      sourceType: 'B3_ANNUAL_REPORT_XLSX',
      formatName: 'Área do Investidor B3 — Relatório Consolidado Anual (Posição Inicial)',
    };
  }
  if (lowered.includes('moviment')) {
    return {
      sourceType: 'B3_MOVEMENT_XLSX',
      formatName: 'Área do Investidor B3 — Movimentação',
    };
  }
  return {
    sourceType: 'B3_NEGOTIATION_XLSX',
    formatName: 'Área do Investidor B3 — Negociação',
  };
}

export interface MovementNoticeLike {
  rowNumber: number;
  group: string;
  movement: string;
  ticker: string;
  tradeDate: string | null;
  quantity: string | null;
  reasonCode: string;
  message: string;
}

export interface MovementNoticeGroup {
  key: string;
  label: string;
  count: number;
  items: MovementNoticeLike[];
}

const NOTICE_GROUP_ORDER = [
  'rights',
  'cash',
  'loans',
  'markers',
  'review',
  'other',
] as const;

const NOTICE_GROUP_LABELS: Record<(typeof NOTICE_GROUP_ORDER)[number], string> = {
  rights: 'Direitos e subscrições',
  cash: 'Proventos / caixa',
  loans: 'Empréstimos',
  markers: 'Atualizações informativas',
  review: 'Revisão necessária',
  other: 'Outros',
};

function noticeGroupKey(notice: MovementNoticeLike): (typeof NOTICE_GROUP_ORDER)[number] {
  if (notice.group === 'CASH_ONLY') return 'cash';
  if (notice.reasonCode === 'SUBSCRIPTION_LIFECYCLE_MANUAL') return 'rights';
  if (notice.group === 'INFORMATIONAL') {
    return notice.reasonCode === 'LOAN_CUSTODY_STATE' ? 'loans' : 'markers';
  }
  if (notice.group === 'REVIEW_REQUIRED') return 'review';
  return 'other';
}

/**
 * Groups movement notices for the dedicated Import Hub section.
 * Pure, deterministic, stable group order; items sorted by source row.
 * Notices never enter readyCount / willImport / confirm payloads — the
 * section is display-only by construction (callers pass notices separately).
 */
export function groupMovementNotices(notices: readonly MovementNoticeLike[]): MovementNoticeGroup[] {
  const buckets = new Map<(typeof NOTICE_GROUP_ORDER)[number], MovementNoticeLike[]>();
  for (const notice of notices) {
    const key = noticeGroupKey(notice);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(notice);
    else buckets.set(key, [notice]);
  }
  const groups: MovementNoticeGroup[] = [];
  for (const key of NOTICE_GROUP_ORDER) {
    const items = buckets.get(key);
    if (!items || items.length === 0) continue;
    groups.push({
      key,
      label: NOTICE_GROUP_LABELS[key],
      count: items.length,
      items: [...items].sort((a, b) => a.rowNumber - b.rowNumber),
    });
  }
  return groups;
}
