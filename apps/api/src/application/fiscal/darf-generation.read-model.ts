import type { DarfHandoffPlan } from '@atlas/tax-engine';
import type { OfficialDarfGenerationRow, TaxpayerIdentityRow } from '@atlas/database';

/**
 * Phase 4F — serializable read models for official DARF readiness, handoff and
 * generation/handoff records. All money is exact decimal strings; dates are
 * civil `YYYY-MM-DD`. No client math (ADR-287).
 */
export interface DarfMoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface DarfDestinationReadModel {
  readonly sourceSystem: string;
  readonly url: string;
  readonly prefillSupported: boolean;
}

export interface DarfPreparedValuesReadModel {
  readonly revenueCode: string;
  readonly competence: string;
  readonly dueDate: string | null;
  readonly principalAmount: DarfMoneyReadModel;
  readonly carryForwardAmount: DarfMoneyReadModel | null;
  readonly lateFeeAmount: DarfMoneyReadModel | null;
  readonly interestAmount: DarfMoneyReadModel | null;
  readonly totalAmount: DarfMoneyReadModel;
}

export interface DarfAdjustmentReadModel {
  readonly status: string;
  readonly reasonCode: string | null;
  readonly lateFeeAmount: DarfMoneyReadModel | null;
  readonly interestAmount: DarfMoneyReadModel | null;
  readonly updatedAmount: DarfMoneyReadModel | null;
  readonly paymentDate: string;
}

export interface TaxpayerIdentityReadModel {
  readonly identityAvailable: boolean;
  readonly identityType: string | null;
  readonly maskedIdentifier: string | null;
}

export interface DarfReadinessReadModel {
  readonly obligationId: string;
  readonly competence: string;
  readonly status: string;
  readonly reasonCode: string | null;
  readonly generationMode: string;
  readonly eligible: boolean;
  readonly overdue: boolean;
  readonly revenueCode: string | null;
  readonly dueDate: string | null;
  readonly preparedValues: DarfPreparedValuesReadModel | null;
  readonly destination: DarfDestinationReadModel | null;
  readonly requiresTaxpayerIdentity: boolean;
  readonly requiresUserAction: boolean;
  readonly instructions: readonly string[];
  readonly identity: TaxpayerIdentityReadModel;
  readonly adjustment: DarfAdjustmentReadModel | null;
  readonly sourceSystem: string;
  readonly officialGenerationSupported: boolean;
  readonly disclaimer: string;
}

export interface DarfGenerationRecordReadModel {
  readonly id: string;
  readonly obligationId: string | null;
  readonly aggregationId: string | null;
  readonly generationMode: string;
  readonly revenueCode: string;
  readonly competence: string;
  readonly dueDate: string | null;
  readonly principalAmount: DarfMoneyReadModel;
  readonly carryForwardAmount: DarfMoneyReadModel | null;
  readonly lateFeeAmount: DarfMoneyReadModel | null;
  readonly interestAmount: DarfMoneyReadModel | null;
  readonly totalAmount: DarfMoneyReadModel;
  readonly officialDocumentId: string | null;
  readonly officialReference: string | null;
  readonly sourceSystem: string;
  readonly status: string;
  readonly version: number;
  readonly supersededById: string | null;
  readonly createdAt: string;
  readonly generatedByAtlas: false;
  readonly disclaimer: string;
}

export interface DarfHandoffResultReadModel {
  readonly readiness: DarfReadinessReadModel;
  readonly record: DarfGenerationRecordReadModel | null;
}

const DISCLAIMER =
  'O Atlas não emite nem armazena o DARF oficial. O documento é gerado pela Receita ' +
  'Federal no Sicalc (Sistema de Cálculo de Acréscimos Legais). O Atlas apenas prepara ' +
  'os valores exatos e orienta a emissão no serviço oficial. DARF gerado não significa ' +
  'DARF pago.';

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function money(amount: string | null | undefined, currency: string): DarfMoneyReadModel | null {
  return amount === null || amount === undefined ? null : { amount, currency };
}

export function mapIdentityToReadModel(row: TaxpayerIdentityRow | null): TaxpayerIdentityReadModel {
  return {
    identityAvailable: row?.identityAvailable ?? false,
    identityType: row?.identityType ?? null,
    maskedIdentifier: row?.maskedIdentifier ?? null,
  };
}

export function mapDarfRecordToReadModel(
  row: OfficialDarfGenerationRow,
  carryForwardAmount: string | null = null,
): DarfGenerationRecordReadModel {
  const currency = row.currency;
  return {
    id: row.id,
    obligationId: row.taxObligationId,
    aggregationId: row.taxPaymentAggregationId,
    generationMode: row.generationMode,
    revenueCode: row.revenueCode,
    competence: row.competence,
    dueDate: isoDate(row.dueDate),
    principalAmount: { amount: row.principalAmount, currency },
    carryForwardAmount: money(carryForwardAmount, currency),
    lateFeeAmount: money(row.lateFeeAmount, currency),
    interestAmount: money(row.interestAmount, currency),
    totalAmount: { amount: row.totalAmount, currency },
    officialDocumentId: row.officialDocumentId,
    officialReference: row.officialReference,
    sourceSystem: row.sourceSystem,
    status: row.status,
    version: row.version,
    supersededById: row.supersededById,
    createdAt: row.createdAt.toISOString(),
    generatedByAtlas: false,
    disclaimer: DISCLAIMER,
  };
}

export function mapPlanToReadiness(input: {
  readonly obligationId: string;
  readonly competence: string;
  readonly overdue: boolean;
  readonly plan: DarfHandoffPlan;
  readonly identity: TaxpayerIdentityReadModel;
  readonly adjustment: DarfAdjustmentReadModel | null;
  readonly currency: string;
}): DarfReadinessReadModel {
  const { plan } = input;
  const currency = plan.preparedValues?.currency ?? input.currency;
  const prepared = plan.preparedValues
    ? {
        revenueCode: plan.preparedValues.revenueCode,
        competence: plan.preparedValues.competence,
        dueDate: plan.preparedValues.dueDate,
        principalAmount: { amount: plan.preparedValues.principalAmount, currency },
        carryForwardAmount: money(plan.preparedValues.carryForwardAmount, currency),
        lateFeeAmount: money(plan.preparedValues.lateFeeAmount, currency),
        interestAmount: money(plan.preparedValues.interestAmount, currency),
        totalAmount: { amount: plan.preparedValues.totalAmount, currency },
      }
    : null;

  return {
    obligationId: input.obligationId,
    competence: input.competence,
    status: plan.status,
    reasonCode: plan.reasonCode,
    generationMode: plan.generationMode,
    eligible: plan.status === 'USER_ACTION_REQUIRED',
    overdue: input.overdue,
    revenueCode: plan.revenueCode,
    dueDate: prepared?.dueDate ?? null,
    preparedValues: prepared,
    destination: plan.destination
      ? {
          sourceSystem: plan.destination.sourceSystem,
          url: plan.destination.url,
          prefillSupported: plan.destination.prefillSupported,
        }
      : null,
    requiresTaxpayerIdentity: plan.requiresTaxpayerIdentity,
    requiresUserAction: plan.requiresUserAction,
    instructions: plan.instructions,
    identity: input.identity,
    adjustment: input.adjustment,
    sourceSystem: 'RFB_SICALC',
    officialGenerationSupported: false,
    disclaimer: DISCLAIMER,
  };
}

export { DISCLAIMER as DARF_HANDOFF_DISCLAIMER };
