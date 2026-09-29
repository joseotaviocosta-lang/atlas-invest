/**
 * Phase 4F — Official DARF handoff (pure domain).
 *
 * Research (2026-09-29) found NO officially supported, documented programmatic
 * API to generate a DARF for IRPF/ganhos líquidos (revenue code 6015). The
 * official generator is the RFB/SERPRO **SicalcWeb**, a browser application that
 * requires the taxpayer to type CPF/date of birth and (in some flows) a captcha,
 * and that recomputes multa/juros itself. Therefore Atlas adopts
 * `OFFICIAL_INTERACTIVE_HANDOFF`: it prepares exact structured values and sends
 * the user to the official service. Atlas NEVER renders a DARF and never calls
 * an undocumented browser endpoint as if it were a supported API
 * (ADR-284, ADR-285, ADR-289).
 *
 * This module performs NO tax math and has NO network access. It consumes the
 * authoritative upstream values (DarfPreparationV2 / eligibility / 4D
 * adjustment) and assembles a validated handoff plan (ADR-287).
 */
export const DARF_GENERATION_MODES = [
  'DIRECT_OFFICIAL_API',
  'OFFICIAL_INTERACTIVE_HANDOFF',
  'OFFICIAL_RESULT_SNAPSHOT',
  'HYBRID',
  'UNSUPPORTED',
] as const;
export type DarfGenerationMode = (typeof DARF_GENERATION_MODES)[number];

export const DARF_GENERATION_STATUSES = [
  'PREPARATION_READY',
  'USER_ACTION_REQUIRED',
  'GENERATING',
  'GENERATED',
  'FAILED',
  'SUPERSEDED',
  'EXPIRED',
  'BLOCKED',
] as const;
export type DarfGenerationStatus = (typeof DARF_GENERATION_STATUSES)[number];

export const DARF_HANDOFF_REASON_CODES = [
  'NOT_PAYABLE',
  'BELOW_MINIMUM',
  'UNSUPPORTED_CODE',
  'MISSING_PREPARATION',
  'MISSING_OFFICIAL_DEADLINE',
  'ADJUSTMENT_UNAVAILABLE',
  'TAXPAYER_IDENTITY_REQUIRED',
  'OFFICIAL_SERVICE_UNAVAILABLE',
  'CAPTCHA_REQUIRED',
  'AUTH_REQUIRED',
  'PARITY_MISMATCH',
  'UNSUPPORTED_OPERATION',
  'MALFORMED_RESPONSE',
] as const;
export type DarfHandoffReasonCode = (typeof DARF_HANDOFF_REASON_CODES)[number];

/** Official destination metadata (source system + canonical URL). */
export interface OfficialDarfDestination {
  readonly sourceSystem: string;
  readonly url: string;
  /** True only when the official service documents URL prefill parameters. */
  readonly prefillSupported: boolean;
}

export interface DarfHandoffPreparedValues {
  readonly revenueCode: string;
  /** Período de apuração (civil competence `YYYY-MM`). */
  readonly competence: string;
  readonly dueDate: string | null;
  /** Aggregate principal to enter on Sicalc (current + carry-forward). */
  readonly principalAmount: string;
  /** Prior-period carried amount, preserved for audit (may be null). */
  readonly carryForwardAmount: string | null;
  readonly lateFeeAmount: string | null;
  readonly interestAmount: string | null;
  readonly totalAmount: string;
  readonly currency: string;
}

export interface DarfHandoffPlan {
  readonly generationMode: DarfGenerationMode;
  readonly status: DarfGenerationStatus;
  readonly reasonCode: DarfHandoffReasonCode | null;
  readonly revenueCode: string | null;
  readonly competence: string | null;
  readonly destination: OfficialDarfDestination | null;
  readonly preparedValues: DarfHandoffPreparedValues | null;
  readonly requiresTaxpayerIdentity: boolean;
  readonly requiresUserAction: boolean;
  readonly instructions: readonly string[];
  readonly fingerprint: string;
}

export type DarfAdjustmentSnapshot =
  | {
      readonly status: 'NOT_LATE' | 'READY';
      readonly updatedAmount: string;
      readonly lateFee: string;
      readonly interest: string;
    }
  | { readonly status: 'BLOCKED'; readonly reasonCode: string | null };

export interface BuildDarfHandoffPlanInput {
  readonly revenueCode: string | null;
  readonly competence: string;
  readonly currency: string;
  readonly eligibilityStatus: string;
  readonly totalPayable: string | null;
  readonly minimumThreshold: string | null;
  readonly currentPrincipal: string | null;
  readonly carryForwardAmount: string | null;
  readonly dueDate: string | null;
  readonly overdue: boolean;
  /** Present when overdue; `null` when not overdue. */
  readonly adjustment: DarfAdjustmentSnapshot | null;
  readonly identityAvailable: boolean;
  readonly destination: OfficialDarfDestination;
  readonly supportedRevenueCodes: readonly string[];
  readonly paymentDate: string | null;
}

export function computeDarfHandoffFingerprint(input: BuildDarfHandoffPlanInput): string {
  return [
    input.revenueCode ?? '',
    input.competence,
    input.eligibilityStatus,
    input.totalPayable ?? '',
    input.currency,
    input.overdue ? 'OVERDUE' : 'ON_TIME',
    input.adjustment ? input.adjustment.status : 'NONE',
    input.overdue && input.adjustment && input.adjustment.status !== 'BLOCKED'
      ? input.adjustment.updatedAmount
      : '',
    input.paymentDate ?? '',
    input.identityAvailable ? 'IDENTITY' : 'NO_IDENTITY',
    input.destination.sourceSystem,
    'handoff-v1',
  ].join('|');
}

function blocked(
  input: BuildDarfHandoffPlanInput,
  reasonCode: DarfHandoffReasonCode,
  fingerprint: string,
): DarfHandoffPlan {
  return Object.freeze({
    generationMode: 'OFFICIAL_INTERACTIVE_HANDOFF',
    status: 'BLOCKED',
    reasonCode,
    revenueCode: input.revenueCode,
    competence: input.competence,
    destination: null,
    preparedValues: null,
    requiresTaxpayerIdentity: !input.identityAvailable,
    requiresUserAction: false,
    instructions: [],
    fingerprint,
  });
}

const INSTRUCTIONS: readonly string[] = Object.freeze([
  'Acesse o Sicalc oficial da Receita Federal e escolha "Preenchimento rápido".',
  'Informe Pessoa Física, seu CPF e sua data de nascimento.',
  'Informe o código de receita e o período de apuração (PA) indicados abaixo.',
  'Informe o valor principal indicado abaixo e clique em "Calcular".',
  'O Sicalc calcula multa e juros oficialmente; confira o total exibido.',
  'Clique em "Emitir Darf" para gerar o documento oficial e efetue o pagamento.',
  'O Atlas não emite nem armazena o DARF oficial; o documento é gerado pela Receita Federal.',
]);

/**
 * Assembles the official handoff plan. Fails closed (`BLOCKED`) when the
 * preparation is not payable, the code is unsupported, the official deadline is
 * missing, or an overdue adjustment is unavailable. Never fabricates a document,
 * barcode, PIX or QR.
 */
export function buildDarfHandoffPlan(input: BuildDarfHandoffPlanInput): DarfHandoffPlan {
  const fingerprint = computeDarfHandoffFingerprint(input);

  if (input.revenueCode === null) {
    return blocked(input, 'MISSING_PREPARATION', fingerprint);
  }
  if (!input.supportedRevenueCodes.includes(input.revenueCode)) {
    return blocked(input, 'UNSUPPORTED_CODE', fingerprint);
  }
  if (
    input.eligibilityStatus === 'CARRIED_FORWARD' ||
    input.eligibilityStatus === 'BELOW_MINIMUM'
  ) {
    return blocked(input, 'BELOW_MINIMUM', fingerprint);
  }
  if (input.eligibilityStatus !== 'PAYABLE') {
    return blocked(input, 'NOT_PAYABLE', fingerprint);
  }
  if (input.totalPayable === null) {
    return blocked(input, 'MISSING_PREPARATION', fingerprint);
  }
  if (input.dueDate === null) {
    return blocked(input, 'MISSING_OFFICIAL_DEADLINE', fingerprint);
  }

  let lateFee: string | null = null;
  let interest: string | null = null;
  let totalAmount = input.totalPayable;
  if (input.overdue) {
    if (!input.adjustment || input.adjustment.status === 'BLOCKED') {
      return blocked(input, 'ADJUSTMENT_UNAVAILABLE', fingerprint);
    }
    lateFee = input.adjustment.lateFee;
    interest = input.adjustment.interest;
    totalAmount = input.adjustment.updatedAmount;
  }

  const preparedValues: DarfHandoffPreparedValues = Object.freeze({
    revenueCode: input.revenueCode,
    competence: input.competence,
    dueDate: input.dueDate,
    principalAmount: input.totalPayable,
    carryForwardAmount: input.carryForwardAmount,
    lateFeeAmount: lateFee,
    interestAmount: interest,
    totalAmount,
    currency: input.currency,
  });

  return Object.freeze({
    generationMode: 'OFFICIAL_INTERACTIVE_HANDOFF',
    status: 'USER_ACTION_REQUIRED',
    reasonCode: input.identityAvailable ? null : 'TAXPAYER_IDENTITY_REQUIRED',
    revenueCode: input.revenueCode,
    competence: input.competence,
    destination: input.destination,
    preparedValues,
    requiresTaxpayerIdentity: !input.identityAvailable,
    requiresUserAction: true,
    instructions: INSTRUCTIONS,
    fingerprint,
  });
}
