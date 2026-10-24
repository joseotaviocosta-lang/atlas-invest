/**
 * Phase 5Q-D — allocation scenario presentation (pure, shared).
 *
 * Formatting only: pt-BR money, basis points, neutral deviation language.
 * No floats in parsing, no weights computed here (server is the authority),
 * no advice, no execution vocabulary.
 */

export interface AllocationScenarioRowView {
  category: string;
  targetBp: number;
  currentBp: number | null;
  scenarioAmount: string;
  projectedValue: string;
  projectedBp: number;
  currentDeviationBp: number | null;
  projectedDeviationBp: number;
  state: 'ABOVE_TARGET' | 'BELOW_TARGET' | 'ON_TARGET' | 'UNAVAILABLE';
}

export interface AllocationScenarioResultView {
  currency: string;
  scenarioTotal: string;
  coverage: string | null;
  currentTotal: string;
  projectedTotal: string;
  rows: AllocationScenarioRowView[];
  beforeOutsideCount: number;
  afterOutsideCount: number;
  limitations: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  FII: 'Fundos Imobiliários (FIIs)',
  ETF: 'ETFs',
  BDR: 'BDRs',
  FIXED_INCOME: 'Renda Fixa',
  TREASURY: 'Tesouro Direto',
  FUND: 'Fundos',
  CASH: 'Caixa',
  OTHER: 'Outros',
};

export function scenarioCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** Canonical decimal ('10000.5') -> 'R$ 10.000,50'. Display only, string math. */
export function formatScenarioMoney(canonical: string, currency = 'BRL'): string {
  const trimmed = canonical.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return trimmed;
  const grouped = match[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = ((match[2] ?? '') + '00').slice(0, 2);
  const prefix = currency === 'BRL' ? 'R$ ' : `${currency} `;
  return `${prefix}${grouped},${frac}`;
}

/** Integer basis points -> '25,00%'. Display only. */
export function formatScenarioBp(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return '—';
  const negative = value < 0;
  const abs = Math.abs(value);
  const intPart = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${frac}%`;
}

/** Signed deviation -> '-5,00 p.p. → -1,80 p.p.'. Neutral, no judgment. */
export function formatScenarioDeviationTransition(before: number | null, after: number): string {
  const format = (value: number | null): string => {
    if (value === null || !Number.isSafeInteger(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const abs = Math.abs(value);
    const intPart = Math.floor(abs / 100).toString();
    const frac = String(abs % 100).padStart(2, '0');
    return `${sign}${intPart},${frac} p.p.`;
  };
  return `${format(before)} → ${format(after)}`;
}

export function describeScenarioState(state: string): string {
  if (state === 'ABOVE_TARGET') return 'Acima da meta';
  if (state === 'BELOW_TARGET') return 'Abaixo da meta';
  if (state === 'ON_TARGET') return 'Na meta';
  return 'Dados indisponíveis';
}

export function describeScenarioLimitation(code: string): string {
  if (code === 'PARTIAL_COVERAGE')
    return 'A simulação considera apenas o valor conhecido da carteira.';
  if (code === 'INSUFFICIENT_DATA')
    return 'Dados insuficientes para simular: cobertura abaixo do mínimo ou carteira sem valor conhecido.';
  return 'Limitação indisponível.';
}
