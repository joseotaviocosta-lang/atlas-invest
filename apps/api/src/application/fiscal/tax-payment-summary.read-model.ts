import type {
  DarfPaymentEligibility,
  MinimumDarfRuleSet,
  TaxCarryForwardEntry,
} from '@atlas/tax-engine';
import type { TaxCarryForwardEntryRow, TaxPaymentAggregationRow } from '@atlas/database';
import type {
  TaxObligationReadModel,
  ObligationCompositionReadModel,
} from './tax-obligation.read-model';

/**
 * Phase 4E — serializable read models for minimum-DARF payment eligibility,
 * carry-forward entries and payment aggregations. All money is exact decimal
 * strings; all dates are civil `YYYY-MM-DD`; `null` means unavailable (never
 * `"0"`). No tax arithmetic happens here (ADR-278/279).
 */
export interface TaxMoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface CarryForwardReadModel {
  readonly id: string;
  readonly sourceObligationId: string;
  readonly sourceCompetence: string;
  readonly revenueCode: string;
  readonly amount: TaxMoneyReadModel;
  readonly status: string;
  readonly targetCompetence: string | null;
  readonly consumedByAggregationId: string | null;
  readonly consumedAt: string | null;
  readonly ruleId: string;
  readonly ruleVersion: string;
}

export interface EligibilitySourceReadModel {
  readonly kind: 'CURRENT' | 'CARRY_FORWARD';
  readonly sourceObligationId: string | null;
  readonly sourceCompetence: string;
  readonly amount: TaxMoneyReadModel;
  readonly entryId: string | null;
}

export interface MinimumDarfRuleReadModel {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly minimumAmount: TaxMoneyReadModel;
  readonly comparison: string;
  readonly sameRevenueCodeRequired: boolean;
  readonly carryForwardAllowed: boolean;
  readonly deferredDueDatePolicy: string;
  readonly sourceIds: readonly string[];
  readonly sourceDocument: string;
  readonly sourceReference: string;
  readonly verifiedAt: string;
}

export interface DarfPreparationV2ReadModel {
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currentPrincipal: TaxMoneyReadModel | null;
  readonly carryForwardAmount: TaxMoneyReadModel | null;
  readonly totalPayable: TaxMoneyReadModel | null;
  readonly minimumThreshold: TaxMoneyReadModel;
  readonly dueDate: string | null;
  readonly eligibilityStatus: string;
  /** Not computed in Phase 4E (requires an explicit payment date); always null. */
  readonly lateFee: TaxMoneyReadModel | null;
  readonly interest: TaxMoneyReadModel | null;
  readonly officialUpdatedAmount: TaxMoneyReadModel | null;
}

export interface TaxPaymentEligibilityReadModel {
  readonly status: string;
  readonly reasonCode: string | null;
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currency: string | null;
  readonly currentAmount: TaxMoneyReadModel | null;
  readonly carryForwardAmount: TaxMoneyReadModel | null;
  readonly totalPayable: TaxMoneyReadModel | null;
  readonly minimumThreshold: TaxMoneyReadModel | null;
  readonly dueDate: string | null;
  readonly currentObligationId: string | null;
  readonly sources: readonly EligibilitySourceReadModel[];
  readonly carryForwardEntries: readonly CarryForwardReadModel[];
  readonly rule: MinimumDarfRuleReadModel | null;
  readonly darfPreparationV2: DarfPreparationV2ReadModel | null;
  readonly dataQuality: string;
  readonly disclaimer: string;
}

export interface TaxPaymentAggregationReadModel {
  readonly id: string;
  readonly revenueCode: string;
  readonly targetCompetence: string;
  readonly currency: string;
  readonly currentAmount: TaxMoneyReadModel;
  readonly carryForwardAmount: TaxMoneyReadModel;
  readonly totalPayable: TaxMoneyReadModel;
  readonly minimumThreshold: TaxMoneyReadModel;
  readonly sourceEntryIds: readonly string[];
  readonly currentObligationId: string | null;
  readonly dueDate: string | null;
  readonly status: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly fingerprint: string;
  readonly createdAt: string;
}

export interface TaxPaymentSummaryReadModel {
  readonly competence: string;
  readonly obligation: TaxObligationReadModel | null;
  /** Phase 4G.2C — composed 6015 category breakdown (null when unavailable). */
  readonly composition: ObligationCompositionReadModel | null;
  readonly eligibility: TaxPaymentEligibilityReadModel;
  readonly aggregation: TaxPaymentAggregationReadModel | null;
  readonly openCarryForwardEntries: readonly CarryForwardReadModel[];
}

const DISCLAIMER =
  'Elegibilidade de recolhimento calculada segundo a regra de DARF mínimo ' +
  '(Lei nº 9.430/1996, art. 68, caput e § 1º). Valores abaixo de R$ 10,00 não são ' +
  'recolhidos por DARF e são adicionados ao mesmo código de receita em períodos ' +
  'subsequentes até atingir o mínimo, quando passam a ser pagos no prazo do último ' +
  'período. Não gera DARF oficial nem efetua pagamento.';

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function money(amount: string | null, currency: string | null): TaxMoneyReadModel | null {
  if (amount === null || currency === null) return null;
  return { amount, currency };
}

export function mapCarryForwardRowToReadModel(row: TaxCarryForwardEntryRow): CarryForwardReadModel {
  return {
    id: row.id,
    sourceObligationId: row.sourceObligationId,
    sourceCompetence: row.sourceCompetence,
    revenueCode: row.revenueCode,
    amount: { amount: row.amount, currency: row.currency },
    status: row.status,
    targetCompetence: row.targetCompetence,
    consumedByAggregationId: row.consumedByAggregationId,
    consumedAt: row.consumedAt ? row.consumedAt.toISOString() : null,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
  };
}

export function mapCarryForwardEntryToReadModel(
  entry: TaxCarryForwardEntry,
): CarryForwardReadModel {
  return {
    id: entry.id,
    sourceObligationId: entry.sourceObligationId,
    sourceCompetence: entry.sourceCompetence,
    revenueCode: entry.revenueCode,
    amount: { amount: entry.amount, currency: entry.currency },
    status: entry.status,
    targetCompetence: entry.targetCompetence,
    consumedByAggregationId: entry.consumedByAggregationId,
    consumedAt: entry.consumedAt,
    ruleId: entry.ruleId,
    ruleVersion: entry.ruleVersion,
  };
}

export function mapAggregationRowToReadModel(
  row: TaxPaymentAggregationRow,
): TaxPaymentAggregationReadModel {
  return {
    id: row.id,
    revenueCode: row.revenueCode,
    targetCompetence: row.targetCompetence,
    currency: row.currency,
    currentAmount: { amount: row.currentAmount, currency: row.currency },
    carryForwardAmount: { amount: row.carryForwardAmount, currency: row.currency },
    totalPayable: { amount: row.totalPayable, currency: row.currency },
    minimumThreshold: { amount: row.minimumThreshold, currency: row.currency },
    sourceEntryIds: row.sourceEntryIds,
    currentObligationId: row.currentObligationId,
    dueDate: isoDate(row.dueDate),
    status: row.status,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    fingerprint: row.fingerprint,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapRuleToReadModel(rule: MinimumDarfRuleSet | null): MinimumDarfRuleReadModel | null {
  if (!rule) return null;
  return {
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    minimumAmount: { amount: rule.minimumAmount, currency: rule.currency },
    comparison: rule.comparison,
    sameRevenueCodeRequired: rule.sameRevenueCodeRequired,
    carryForwardAllowed: rule.carryForwardAllowed,
    deferredDueDatePolicy: rule.deferredDueDatePolicy,
    sourceIds: rule.sourceIds,
    sourceDocument: rule.sourceDocument,
    sourceReference: rule.sourceReference,
    verifiedAt: rule.verifiedAt,
  };
}

function buildDarfPreparationV2(input: {
  readonly eligibility: DarfPaymentEligibility;
  readonly rule: MinimumDarfRuleSet | null;
}): DarfPreparationV2ReadModel | null {
  const { eligibility, rule } = input;
  if (!rule) return null;
  if (eligibility.status !== 'PAYABLE' && eligibility.status !== 'CARRIED_FORWARD') return null;
  const currency = eligibility.currency;
  if (currency === null) return null;
  return {
    revenueCode: eligibility.revenueCode,
    targetCompetence: eligibility.targetCompetence,
    currentPrincipal: money(eligibility.currentAmount, currency),
    carryForwardAmount: money(eligibility.carryForwardAmount, currency),
    totalPayable: money(eligibility.totalPayable, currency),
    minimumThreshold: { amount: rule.minimumAmount, currency: rule.currency },
    dueDate: eligibility.dueDate,
    eligibilityStatus: eligibility.status,
    lateFee: null,
    interest: null,
    officialUpdatedAmount: null,
  };
}

export function mapEligibilityToReadModel(input: {
  readonly eligibility: DarfPaymentEligibility;
  readonly rule: MinimumDarfRuleSet | null;
  readonly carryForwardEntries: readonly TaxCarryForwardEntryRow[];
  readonly dataQuality: string;
}): TaxPaymentEligibilityReadModel {
  const { eligibility } = input;
  const currency = eligibility.currency;
  const entriesById = new Map(input.carryForwardEntries.map((entry) => [entry.id, entry]));
  const referencedEntries = eligibility.carryForwardEntryIds
    .map((id) => entriesById.get(id))
    .filter((entry): entry is TaxCarryForwardEntryRow => entry !== undefined)
    .map(mapCarryForwardRowToReadModel);

  return {
    status: eligibility.status,
    reasonCode: eligibility.reasonCode,
    revenueCode: eligibility.revenueCode,
    targetCompetence: eligibility.targetCompetence,
    currency,
    currentAmount: money(eligibility.currentAmount, currency),
    carryForwardAmount: money(eligibility.carryForwardAmount, currency),
    totalPayable: money(eligibility.totalPayable, currency),
    minimumThreshold: money(eligibility.minimumThreshold, currency),
    dueDate: eligibility.dueDate,
    currentObligationId: eligibility.currentObligationId,
    sources: eligibility.sourceBreakdown.map((source) => ({
      kind: source.kind,
      sourceObligationId: source.sourceObligationId,
      sourceCompetence: source.sourceCompetence,
      amount: { amount: source.amount, currency: currency ?? 'BRL' },
      entryId: source.entryId,
    })),
    carryForwardEntries: referencedEntries,
    rule: mapRuleToReadModel(input.rule),
    darfPreparationV2: buildDarfPreparationV2({ eligibility, rule: input.rule }),
    dataQuality: input.dataQuality,
    disclaimer: DISCLAIMER,
  };
}
