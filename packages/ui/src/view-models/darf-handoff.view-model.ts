import { formatCurrency, formatDate } from '../formatters';
import { colors } from '../tokens/colors';

/**
 * Official DARF readiness/handoff view-model (Phase 4F).
 *
 * Presentation only. Atlas does NOT generate the official DARF; the server
 * prepares exact values and points to the official Sicalc service. The action is
 * labelled "Abrir Sicalc" / "Usar dados no Sicalc", never "Gerar DARF oficial"
 * (ADR-285). No client math.
 */
export interface RawDarfMoney {
  amount: string;
  currency: string;
}

export interface RawDarfReadiness {
  obligationId: string;
  competence: string;
  status: string;
  reasonCode: string | null;
  generationMode: string;
  eligible: boolean;
  overdue: boolean;
  revenueCode: string | null;
  dueDate: string | null;
  preparedValues: {
    revenueCode: string;
    competence: string;
    dueDate: string | null;
    principalAmount: RawDarfMoney;
    carryForwardAmount: RawDarfMoney | null;
    lateFeeAmount: RawDarfMoney | null;
    interestAmount: RawDarfMoney | null;
    totalAmount: RawDarfMoney;
  } | null;
  destination: { sourceSystem: string; url: string; prefillSupported: boolean } | null;
  requiresTaxpayerIdentity: boolean;
  requiresUserAction: boolean;
  instructions: readonly string[];
  identity: {
    identityAvailable: boolean;
    identityType: string | null;
    maskedIdentifier: string | null;
  };
  adjustment: { status: string } | null;
  sourceSystem: string;
  officialGenerationSupported: boolean;
  disclaimer: string;
}

export interface RawDarfGenerationRecord {
  id: string;
  generationMode: string;
  revenueCode: string;
  competence: string;
  dueDate: string | null;
  principalAmount: RawDarfMoney;
  carryForwardAmount: RawDarfMoney | null;
  lateFeeAmount: RawDarfMoney | null;
  interestAmount: RawDarfMoney | null;
  totalAmount: RawDarfMoney;
  sourceSystem: string;
  status: string;
  version: number;
  generatedByAtlas: boolean;
  disclaimer: string;
}

export interface DarfHandoffViewModel {
  obligationId: string;
  competenceLabel: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  reasonCode: string | null;
  reasonLabel: string | null;
  eligible: boolean;
  overdue: boolean;
  revenueCode: string | null;
  dueDateFormatted: string;
  principalFormatted: string;
  carryForwardFormatted: string | null;
  lateFeeFormatted: string | null;
  interestFormatted: string | null;
  totalFormatted: string;
  officialSourceLabel: string;
  destinationUrl: string | null;
  actionLabel: string;
  requiresTaxpayerIdentity: boolean;
  identityMasked: string | null;
  instructions: readonly string[];
  recordStatusLabel: string | null;
  disclaimer: string;
  accessibilitySummary: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  USER_ACTION_REQUIRED: { label: 'Dados preparados — ação necessária', color: colors.accent },
  PREPARATION_READY: { label: 'Dados preparados', color: colors.accent },
  BLOCKED: { label: 'Indisponível', color: colors.warning },
  GENERATED: { label: 'Gerado no serviço oficial', color: colors.positive },
  SUPERSEDED: { label: 'Substituído', color: colors.textMuted },
};

const REASON: Record<string, string> = {
  BELOW_MINIMUM: 'Valor abaixo do mínimo para emissão de DARF.',
  NOT_PAYABLE: 'Não há imposto a recolher nesta competência.',
  UNSUPPORTED_CODE: 'Código de receita sem suporte de geração nesta fase.',
  MISSING_OFFICIAL_DEADLINE: 'Vencimento oficial indisponível.',
  ADJUSTMENT_UNAVAILABLE:
    'Acréscimos legais (multa/juros) não puderam ser verificados oficialmente.',
  TAXPAYER_IDENTITY_REQUIRED: 'Informe seu CPF para agilizar o preenchimento no Sicalc.',
  OFFICIAL_SERVICE_UNAVAILABLE: 'Serviço oficial indisponível no momento.',
  CAPTCHA_REQUIRED: 'O serviço oficial exige interação do usuário (captcha).',
};

const RECORD_STATUS: Record<string, string> = {
  USER_ACTION_REQUIRED: 'Aguardando emissão no Sicalc',
  GENERATED: 'Gerado no serviço oficial',
  SUPERSEDED: 'Substituído',
  BLOCKED: 'Bloqueado',
};

function money(value: RawDarfMoney | null | undefined): string {
  return value ? formatCurrency(value.amount, value.currency) : '—';
}

function competenceLabel(competence: string | null | undefined): string {
  if (!competence) return '—';
  const [year, month] = competence.split('-');
  return `${month}/${year}`;
}

export function mapToDarfHandoffViewModel(
  readiness: RawDarfReadiness | null,
  record: RawDarfGenerationRecord | null = null,
): DarfHandoffViewModel | null {
  if (!readiness || typeof readiness.competence !== 'string') return null;
  const status = STATUS[readiness.status] ?? {
    label: readiness.status,
    color: colors.textMuted,
  };
  const prepared = readiness.preparedValues;
  const reasonLabel = readiness.reasonCode ? (REASON[readiness.reasonCode] ?? null) : null;
  const officialSourceLabel = 'Receita Federal — Sicalc';
  const actionLabel = readiness.eligible ? 'Abrir Sicalc' : 'Indisponível';

  const accessibilitySummary =
    `Emissão de DARF da competência ${competenceLabel(readiness.competence)}: ${status.label}. ` +
    (prepared ? `Total ${money(prepared.totalAmount)}. ` : '') +
    `Fonte oficial: ${officialSourceLabel}. O documento é gerado pela Receita Federal.`;

  return {
    obligationId: readiness.obligationId,
    competenceLabel: competenceLabel(readiness.competence),
    status: readiness.status,
    statusLabel: status.label,
    statusColor: status.color,
    reasonCode: readiness.reasonCode,
    reasonLabel,
    eligible: readiness.eligible,
    overdue: readiness.overdue,
    revenueCode: readiness.revenueCode,
    dueDateFormatted: prepared?.dueDate ? formatDate(prepared.dueDate) : '—',
    principalFormatted: money(prepared?.principalAmount),
    carryForwardFormatted: prepared?.carryForwardAmount ? money(prepared.carryForwardAmount) : null,
    lateFeeFormatted: prepared?.lateFeeAmount ? money(prepared.lateFeeAmount) : null,
    interestFormatted: prepared?.interestAmount ? money(prepared.interestAmount) : null,
    totalFormatted: money(prepared?.totalAmount),
    officialSourceLabel,
    destinationUrl: readiness.destination?.url ?? null,
    actionLabel,
    requiresTaxpayerIdentity: readiness.requiresTaxpayerIdentity,
    identityMasked: readiness.identity.maskedIdentifier,
    instructions: readiness.instructions,
    recordStatusLabel: record ? (RECORD_STATUS[record.status] ?? record.status) : null,
    disclaimer: readiness.disclaimer,
    accessibilitySummary,
  };
}

export function darfReadinessQueryKey(obligationId: string): readonly string[] {
  return ['fiscal-darf-readiness', obligationId] as const;
}
