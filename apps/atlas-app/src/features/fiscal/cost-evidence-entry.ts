/**
 * Historical cost-evidence entry helpers and view models.
 *
 * Pure, dependency-free utilities: labels, validation, payload formatting,
 * and presentation-state derivation for versioned cost-evidence rows.
 * Zero floats: strictly string decimals and ISO civil dates.
 */

export const COST_EVIDENCE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'BROKERAGE_NOTE', label: 'Nota de corretagem' },
  { value: 'BROKER_STATEMENT', label: 'Extrato da corretora' },
  { value: 'ANNUAL_TAX_STATEMENT', label: 'Informe de rendimentos (IR / Bens e Direitos)' },
  { value: 'OFFICIAL_POSITION_REPORT', label: 'Relatório oficial de custódia B3' },
  { value: 'MANUAL_DOCUMENTED', label: 'Documento comprobatório manual' },
];

export const COST_EVIDENCE_TYPE_LABELS: Record<string, string> = {
  BROKERAGE_NOTE: 'Nota de corretagem',
  BROKER_STATEMENT: 'Extrato da corretora',
  ANNUAL_TAX_STATEMENT: 'Informe de rendimentos (IR)',
  OFFICIAL_POSITION_REPORT: 'Relatório oficial B3',
  MANUAL_DOCUMENTED: 'Documento manual',
};

export const COST_EVIDENCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho (Aguardando comprovação)',
  REVIEW_REQUIRED: 'Aguardando validação',
  VERIFIED: 'Regularizado e Auditado',
  REJECTED: 'Rejeitado',
};

export const COST_EVIDENCE_ASSESSMENT_LABELS: Record<string, string> = {
  COMPLETE: 'Cobertura Completa (Regularizado)',
  PARTIAL: 'Cobertura Parcial',
  INCOMPLETE: 'Pendente de Comprovação Documental',
  BLOCKED: 'Bloqueado (Revisar evidências)',
};

export const COST_EVIDENCE_FAIL_CLOSED_DISCLOSURE =
  'Princípio Fail-Closed: O registro de uma comprovação não desbloqueia imediatamente a apuração de DARF. Apenas a validação definitiva da evidência com cobertura integral da posição habilita o cálculo seguro de ganhos tributáveis.';

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizes Brazilian and international decimal representations without ambiguity.
 * Accepts:
 *  - "1.234,56" -> "1234.56" (Brazilian with thousands separator)
 *  - "1234,56"   -> "1234.56" (Brazilian comma decimal)
 *  - "1234.56"   -> "1234.56" (Standard dot decimal)
 *  - "1,234.56"  -> "1234.56" (US with comma thousands separator)
 *  - "1234"      -> "1234"    (Integer)
 * Returns the raw string if ambiguous or invalid so validation can reject it.
 */
export function normalizeDecimalField(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Case 1: Brazilian formatted number with thousands dot and decimal comma: e.g. "1.234,56"
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(trimmed)) {
    return trimmed.replace(/\./g, '').replace(',', '.');
  }

  // Case 2: US formatted number with thousands comma and decimal dot: e.g. "1,234.56"
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(trimmed)) {
    return trimmed.replace(/,/g, '');
  }

  // Case 3: Plain comma decimal: e.g. "1234,56"
  if (/^\d+,\d+$/.test(trimmed)) {
    return trimmed.replace(',', '.');
  }

  // Case 4: Plain dot decimal or integer: e.g. "1234.56" or "1234"
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export function isDecimal(value: string): boolean {
  const normalized = normalizeDecimalField(value);
  return DECIMAL_RE.test(normalized);
}

export function isPositiveDecimal(value: string): boolean {
  const normalized = normalizeDecimalField(value);
  if (!DECIMAL_RE.test(normalized)) return false;
  const [int = '', frac = ''] = normalized.split('.');
  return [...int].some((d) => d !== '0') || [...frac].some((d) => d !== '0');
}

export interface CostEvidenceDraft {
  evidenceType: string;
  acquisitionDate: string;
  evidenceDate: string;
  quantityCovered: string;
  unitCost: string;
  totalCost: string;
  currency: string;
  sourceReference: string;
  notes: string;
}

export const INITIAL_COST_EVIDENCE_DRAFT: CostEvidenceDraft = {
  evidenceType: 'BROKERAGE_NOTE',
  acquisitionDate: '',
  evidenceDate: '',
  quantityCovered: '',
  unitCost: '',
  totalCost: '',
  currency: 'BRL',
  sourceReference: '',
  notes: '',
};

/**
 * Shape-only validation. Returns the first validation problem in PT-BR,
 * or null when the draft is well-formed.
 */
export function validateCostEvidenceDraft(draft: CostEvidenceDraft): string | null {
  if (!COST_EVIDENCE_TYPE_OPTIONS.some((o) => o.value === draft.evidenceType)) {
    return 'Selecione o tipo de documento comprobatório.';
  }
  if (!CIVIL_DATE_RE.test(draft.acquisitionDate.trim())) {
    return 'Informe a data de aquisição original no formato AAAA-MM-DD.';
  }
  if (draft.evidenceDate.trim() !== '' && !CIVIL_DATE_RE.test(draft.evidenceDate.trim())) {
    return 'Data do documento inválida. Use o formato AAAA-MM-DD ou deixe em branco.';
  }
  const normQuantity = normalizeDecimalField(draft.quantityCovered);
  if (!isPositiveDecimal(normQuantity)) {
    return 'Informe a quantidade comprovada (valor numérico positivo maior que zero).';
  }
  const normUnit = normalizeDecimalField(draft.unitCost);
  const normTotal = normalizeDecimalField(draft.totalCost);
  const hasUnit = normUnit !== '';
  const hasTotal = normTotal !== '';
  if (!hasUnit && !hasTotal) {
    return 'Informe o preço unitário ou o valor total de aquisição comprovado.';
  }
  if (hasUnit && !isDecimal(normUnit)) {
    return 'Preço unitário inválido. Utilize apenas dígitos numéricos e ponto decimal.';
  }
  if (hasTotal && !isDecimal(normTotal)) {
    return 'Valor total inválido. Utilize apenas dígitos numéricos e ponto decimal.';
  }
  if (draft.currency.trim() === '') {
    return 'Informe a moeda da comprovação.';
  }
  if (draft.sourceReference.trim() === '') {
    return 'Informe a origem ou referência do documento (ex: número da nota, DIRPF 2020 bens e direitos).';
  }
  if (draft.sourceReference.trim().length > 255) {
    return 'A referência do documento deve possuir no máximo 255 caracteres.';
  }
  if (draft.notes.trim().length > 1000) {
    return 'As observações devem possuir no máximo 1000 caracteres.';
  }
  return null;
}

/** Builds the payload object ready for JSON serialization */
export function buildCostEvidencePayload(
  draft: CostEvidenceDraft,
  accountId: string,
  assetId: string,
  status: 'DRAFT' | 'REVIEW_REQUIRED' = 'REVIEW_REQUIRED'
) {
  const normUnit = normalizeDecimalField(draft.unitCost);
  const normTotal = normalizeDecimalField(draft.totalCost);

  const payload: Record<string, string> = {
    accountId,
    assetId,
    evidenceType: draft.evidenceType,
    acquisitionDate: draft.acquisitionDate.trim(),
    quantityCovered: normalizeDecimalField(draft.quantityCovered),
    currency: draft.currency.trim() || 'BRL',
    sourceReference: draft.sourceReference.trim(),
    status,
  };

  if (draft.evidenceDate.trim() !== '') {
    payload['evidenceDate'] = draft.evidenceDate.trim();
  }
  if (normUnit !== '') {
    payload['unitCost'] = normUnit;
  }
  if (normTotal !== '') {
    payload['totalCost'] = normTotal;
  }
  if (draft.notes.trim() !== '') {
    payload['notes'] = draft.notes.trim();
  }

  return payload;
}

export interface EvidenceVersionRow {
  id: string;
  status: string;
  version: number;
  supersedesId: string | null;
}

export interface EvidenceRowViewState {
  isCurrent: boolean;
  successorVersion: number | null;
  showSubmit: boolean;
  showVerify: boolean;
  showReject: boolean;
  historicalLabel: string | null;
}

/**
 * Derives presentation lifecycle state for an evidence row.
 * Only current (non-superseded) rows show interactive actions.
 */
export function getEvidenceRowViewState(
  row: EvidenceVersionRow,
  allRows: readonly EvidenceVersionRow[],
): EvidenceRowViewState {
  const successor = allRows.find((other) => other.supersedesId === row.id) ?? null;
  const isCurrent = successor === null;
  const successorVersion = successor ? successor.version : null;

  return {
    isCurrent,
    successorVersion,
    showSubmit: isCurrent && row.status === 'DRAFT',
    showVerify: isCurrent && row.status === 'REVIEW_REQUIRED',
    showReject: isCurrent && row.status === 'REVIEW_REQUIRED',
    historicalLabel: isCurrent
      ? null
      : successorVersion !== null
        ? `Substituída pela v${successorVersion}`
        : 'Versão histórica substituída',
  };
}
