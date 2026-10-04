import { z } from 'zod';

export const AnnualHighIncomeParamSchema = z.object({
  // Structural only (must be an integer); range is enforced by the use-case,
  // which raises FISCAL.INVALID_YEAR for out-of-range years.
  calendarYear: z.coerce.number().int(),
});

export type AnnualHighIncomeParam = z.infer<typeof AnnualHighIncomeParamSchema>;

const decimalString = z
  .string()
  .regex(
    /^\d{1,18}(\.\d{1,18})?$/,
    'must be a decimal string with up to 18 integer and 18 fraction digits',
  );

const evidenceSourceField = z.enum([
  'PJ_FINANCIAL_STATEMENTS',
  'RFB_PREFILLED',
  'TAXPAYER_CONFIRMED',
]);

const corporateTaxEvidenceSchema = z.object({
  evidenceType: z.literal('CORPORATE_TAX'),
  payerId: z.string().min(1).max(255),
  payerType: z.enum([
    'STANDARD_CORPORATE',
    'INSURANCE_CAPITALIZATION_REGULATED',
    'FINANCIAL_INSTITUTION',
  ]),
  profitPeriodExercise: z.number().int().min(1900).max(2100),
  evidenceMode: z.enum(['FULL', 'SIMPLIFIED']),
  accountingProfit: decimalString,
  irDue: decimalString,
  csllDue: decimalString,
  prouniTaxCredit: decimalString.optional().nullable(),
  simplifiedRevenue: decimalString.optional().nullable(),
  evidenceSource: evidenceSourceField,
});

const annualAmountEvidenceSchema = z.object({
  evidenceType: z.enum(['ANNUAL_ADJUSTMENT_IRPF', 'ANNUAL_INCOME_TOTAL']),
  adjustmentAmount: decimalString,
  evidenceSource: evidenceSourceField,
});

export const RecordHighIncomeEvidenceBodySchema = z.discriminatedUnion('evidenceType', [
  corporateTaxEvidenceSchema,
  annualAmountEvidenceSchema,
]);

export type RecordHighIncomeEvidenceBody = z.infer<typeof RecordHighIncomeEvidenceBodySchema>;

export const ResolveHighIncomeEvidenceBodySchema = z.object({
  decision: z.enum(['KEEP_EXISTING', 'ACCEPT_NEW']),
});

export type ResolveHighIncomeEvidenceBody = z.infer<typeof ResolveHighIncomeEvidenceBodySchema>;
