/**
 * Historical cost-evidence entry helpers (owner-controlled, review-gated).
 *
 * Pure, dependency-free client utilities: labels, input-shape checks and
 * render-only formatting of EXACT server strings. All coverage math happens
 * server-side (assessment/preview endpoints); these helpers never multiply,
 * divide, sum, or otherwise compute financial results.
 */

export const COST_EVIDENCE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'BROKERAGE_NOTE', label: 'Nota de corretagem' },
  { value: 'BROKER_STATEMENT', label: 'Extrato da corretora' },
  { value: 'ANNUAL_TAX_STATEMENT', label: 'Informe de rendimentos (IR)' },
  { value: 'OFFICIAL_POSITION_REPORT', label: 'Relatório oficial de posição' },
  { value: 'MANUAL_DOCUMENTED', label: 'Documento manual' },
];

export const COST_EVIDENCE_TYPE_LABELS: Record<string, string> = {
  BROKERAGE_NOTE: 'Nota de corretagem',
  BROKER_STATEMENT: 'Extrato da corretora',
  ANNUAL_TAX_STATEMENT: 'Informe de rendimentos (IR)',
  OFFICIAL_POSITION_REPORT: 'Relatório oficial de posição',
  MANUAL_DOCUMENTED: 'Documento manual',
};

export const COST_EVIDENCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  REVIEW_REQUIRED: 'Aguardando confirmação',
  VERIFIED: 'Confirmada',
  REJECTED: 'Rejeitada',
};

export const COST_EVIDENCE_TAX_MESSAGE =
  'Evidência de custo registrada. O cálculo tributário continuará bloqueado até que a integração fiscal desta evidência seja validada.';

export const COST_EVIDENCE_ASSESSMENT_STATUSES = [
  'COMPLETE',
  'PARTIAL',
  'INCOMPLETE',
  'BLOCKED',
] as const;

export const COST_EVIDENCE_ASSESSMENT_LABELS: Record<string, string> = {
  COMPLETE: 'Cobertura completa',
  PARTIAL: 'Cobertura parcial',
  INCOMPLETE: 'Sem cobertura',
  BLOCKED: 'Bloqueada — revisar evidências',
};

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDecimal(value: string): boolean {
  return DECIMAL_RE.test(value.trim());
}

function isPositiveDecimal(value: string): boolean {
  if (!isDecimal(value)) return false;
  const [int = '', frac = ''] = value.trim().split('.');
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

/**
 * Shape-only validation. Returns the first problem in PT-BR, or null when
 * the draft is well-formed. Consistency between unit price and total is
 * verified server-side (exact decimals) — the client never multiplies.
 */
export function validateCostEvidenceDraft(draft: CostEvidenceDraft): string | null {
  if (!COST_EVIDENCE_TYPE_OPTIONS.some((o) => o.value === draft.evidenceType)) {
    return 'Selecione o tipo de documento.';
  }
  if (!CIVIL_DATE_RE.test(draft.acquisitionDate.trim())) {
    return 'Informe a data de aquisição (AAAA-MM-DD).';
  }
  if (draft.evidenceDate.trim() !== '' && !CIVIL_DATE_RE.test(draft.evidenceDate.trim())) {
    return 'Data do documento inválida. Use AAAA-MM-DD ou deixe em branco.';
  }
  if (!isPositiveDecimal(draft.quantityCovered)) {
    return 'Informe a quantidade comprovada (maior que zero).';
  }
  const hasUnit = draft.unitCost.trim() !== '';
  const hasTotal = draft.totalCost.trim() !== '';
  if (!hasUnit && !hasTotal) {
    return 'Informe o preço unitário ou o valor total comprovado.';
  }
  if (hasUnit && !isDecimal(draft.unitCost)) {
    return 'Preço unitário inválido. Use apenas dígitos e ponto decimal.';
  }
  if (hasTotal && !isDecimal(draft.totalCost)) {
    return 'Valor total inválido. Use apenas dígitos e ponto decimal.';
  }
  if (draft.currency.trim() === '') {
    return 'Informe a moeda da evidência.';
  }
  if (draft.sourceReference.trim() === '') {
    return 'Informe a origem/referência do documento.';
  }
  if (draft.sourceReference.trim().length > 255) {
    return 'A referência deve ter no máximo 255 caracteres.';
  }
  return null;
}

/** Normalizes a decimal field: trims and converts comma to dot (shape only). */
export function normalizeDecimalField(value: string): string {
  return value.trim().replace(',', '.');
}

/** Builds the create payload, omitting empty optional fields. */
export function buildCostEvidencePayload(draft: CostEvidenceDraft): Record<string, string> {
  const payload: Record<string, string> = {
    evidenceType: draft.evidenceType,
    acquisitionDate: draft.acquisitionDate.trim(),
    quantityCovered: normalizeDecimalField(draft.quantityCovered),
    currency: draft.currency.trim(),
    sourceReference: draft.sourceReference.trim(),
  };
  if (draft.evidenceDate.trim() !== '') payload['evidenceDate'] = draft.evidenceDate.trim();
  if (draft.unitCost.trim() !== '') payload['unitCost'] = normalizeDecimalField(draft.unitCost);
  if (draft.totalCost.trim() !== '') payload['totalCost'] = normalizeDecimalField(draft.totalCost);
  if (draft.notes.trim() !== '') payload['notes'] = draft.notes.trim();
  return payload;
}
