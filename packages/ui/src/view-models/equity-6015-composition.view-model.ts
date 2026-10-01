import { formatCurrency } from '../formatters';
import { colors } from '../tokens/colors';

/**
 * Composed 6015 view-model (Phase 4G.2C).
 *
 * Presentation only. The server composes FII + normal equity + day trade into a
 * single revenue-code 6015 amount; the client NEVER aggregates components or
 * recalculates tax. It formats exact decimal strings and applies factual labels.
 */

export interface RawComposed6015Money {
  amount: string;
  currency: string;
}

export interface RawComposed6015Component {
  category: string;
  label?: string;
  status: string;
  netCategoryTax: RawComposed6015Money | null;
  sourceRuleId?: string | null;
  sourceRuleVersion?: string | null;
}

export interface RawComposed6015 {
  revenueCode: string;
  status: string;
  reasonCode: string | null;
  currency: string;
  total: RawComposed6015Money | null;
  components: readonly RawComposed6015Component[];
  fingerprint: string;
}

export interface Composed6015ComponentViewModel {
  category: string;
  label: string;
  status: string;
  amountFormatted: string;
  isBlocked: boolean;
}

export interface Composed6015ViewModel {
  revenueCode: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  isBlocked: boolean;
  blockedReasonLabel: string | null;
  totalFormatted: string;
  components: readonly Composed6015ComponentViewModel[];
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  FII: 'FII',
  EQUITY_NORMAL: 'Operações comuns',
  EQUITY_DAY_TRADE: 'Day trade',
});

const STATUS: Record<string, { label: string; color: string }> = {
  COMPLETE: { label: 'Composição apurada', color: colors.textPrimary },
  PARTIAL: { label: 'Composição parcial', color: colors.warning },
  BLOCKED: { label: 'Composição bloqueada', color: colors.negative },
  NO_ACTIVITY: { label: 'Sem imposto a recolher', color: colors.textMuted },
};

const REASON_LABELS: Record<string, string> = {
  COMPONENT_BLOCKED: 'Uma categoria está bloqueada por dados insuficientes.',
  COMPONENT_PARTIAL: 'Uma categoria não pôde ser concluída.',
  NEGATIVE_COMPONENT: 'Um valor de categoria é inválido.',
  CURRENCY_MISMATCH: 'Há categorias em moedas distintas (sem conversão cambial).',
  UNSUPPORTED_ACTIVITY: 'Há atividade de categoria fora do escopo desta composição.',
  MISSING_REVENUE_CODE: 'Código de receita indisponível.',
};

export function composed6015CategoryLabel(category: string, fallback?: string): string {
  return CATEGORY_LABELS[category] ?? fallback ?? category;
}

function money(value: RawComposed6015Money | null | undefined): string {
  return value ? formatCurrency(value.amount, value.currency) : '—';
}

export function mapToComposed6015ViewModel(
  raw: RawComposed6015 | null | undefined,
): Composed6015ViewModel | null {
  if (!raw) return null;
  const status = STATUS[raw.status] ?? { label: raw.status, color: colors.textMuted };
  const blocked = raw.status === 'BLOCKED' || raw.status === 'PARTIAL';
  return {
    revenueCode: raw.revenueCode,
    status: raw.status,
    statusLabel: status.label,
    statusColor: status.color,
    isBlocked: raw.status === 'BLOCKED',
    blockedReasonLabel: blocked
      ? (REASON_LABELS[raw.reasonCode ?? ''] ?? 'Composição indisponível com segurança.')
      : null,
    totalFormatted: money(raw.total),
    components: raw.components.map((component) => ({
      category: component.category,
      label: component.label ?? composed6015CategoryLabel(component.category),
      status: component.status,
      amountFormatted: money(component.netCategoryTax),
      isBlocked: component.status === 'BLOCKED',
    })),
  };
}
