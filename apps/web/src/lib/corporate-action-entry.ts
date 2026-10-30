/**
 * Manual corporate-action entry helpers (owner-controlled SPLIT / REVERSE_SPLIT).
 *
 * Pure, dependency-free client utilities: labels, input-shape checks and
 * render-only formatting of EXACT server strings. All financial projection
 * math happens server-side (preview endpoint); these helpers never multiply,
 * divide, sum, or otherwise compute financial results.
 */

export const CORPORATE_ACTION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'REVERSE_SPLIT', label: 'Grupamento' },
  { value: 'SPLIT', label: 'Desdobramento' },
];

export type ManualCorporateActionType = 'SPLIT' | 'REVERSE_SPLIT';

export const CORPORATE_ACTION_TYPE_LABELS: Record<string, string> = {
  SPLIT: 'Desdobramento',
  REVERSE_SPLIT: 'Grupamento',
};

export const CORPORATE_ACTION_TAX_MESSAGE =
  'Este evento corporativo não gera venda, ganho realizado ou DARF.';

const POSITIVE_DECIMAL_RE = /^\d+(\.\d+)?$/;

function isPositiveDecimal(value: string): boolean {
  if (!POSITIVE_DECIMAL_RE.test(value)) return false;
  const [int = '', frac = ''] = value.split('.');
  return [...int].some((d) => d !== '0') || [...frac].some((d) => d !== '0');
}

export interface CorporateActionLegDraft {
  assetId: string;
  type: ManualCorporateActionType;
  tradeDate: string;
  factor: string;
  notes: string;
}

export function validateCorporateActionDraft(draft: CorporateActionLegDraft): string | null {
  if (!draft.assetId) return 'Selecione o ativo do evento.';
  if (draft.type !== 'SPLIT' && draft.type !== 'REVERSE_SPLIT') {
    return 'Tipo de evento inválido. Use Desdobramento ou Grupamento.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.tradeDate)) return 'Informe a data efetiva (AAAA-MM-DD).';
  if (!isPositiveDecimal(draft.factor)) return 'Informe um fator maior que zero.';
  const [intPart = '', fracPart = ''] = draft.factor.split('.');
  const isOne =
    (intPart.replace(/^0+/, '') || '0') === '1' && [...fracPart].every((d) => d === '0');
  if (isOne) return 'O fator não pode ser 1 (sem efeito).';
  if (draft.notes.trim().length === 0) return 'Informe a evidência/observação do evento.';
  if (draft.notes.trim().length > 1000) return 'A evidência deve ter no máximo 1000 caracteres.';
  return null;
}

export function canProjectEffects(
  legs: readonly unknown[],
  accountId: string,
  requestInFlight: boolean,
): boolean {
  return legs.length > 0 && accountId !== '' && !requestInFlight;
}

export function describeCorporateActionLeg(
  type: string,
  factor: string,
  beforeQuantity: string | null,
  afterQuantity: string | null,
): string {
  const label = CORPORATE_ACTION_TYPE_LABELS[type] ?? type;
  if (beforeQuantity === null || afterQuantity === null) return label;
  const op = type === 'REVERSE_SPLIT' ? '÷' : '×';
  return `${label} ${beforeQuantity} ${op} ${factor} = ${afterQuantity}`;
}
