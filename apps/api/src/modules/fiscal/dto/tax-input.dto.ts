import { z } from 'zod';

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const competence = z.string().regex(/^\d{4}-\d{2}$/);
const reference = z.string().min(1).max(255);
const currency = z.string().regex(/^[A-Z]{3}$/);
const decimal = z.string().regex(/^\d{1,18}(\.\d{1,18})?$/);

export const RecordTradeClassificationBodySchema = z.object({
  transactionId: z.string().uuid(),
  classification: z.enum(['NORMAL', 'DAY_TRADE', 'UNKNOWN']),
  sourceType: z.enum(['BROKER_IMPORT', 'CANONICAL_LEDGER', 'MANUAL_CONFIRMED']),
  sourceReference: reference,
  effectiveDate: civilDate,
});
export type RecordTradeClassificationBody = z.infer<typeof RecordTradeClassificationBodySchema>;

export const RecordWithholdingBodySchema = z.object({
  competence,
  economicDate: civilDate,
  category: z.enum(['BRAZILIAN_EQUITY', 'FII', 'ETF', 'BDR', 'FIXED_INCOME', 'UNKNOWN']),
  withholdingCategory: z.enum(['EQUITY_NORMAL', 'EQUITY_DAY_TRADE']).optional(),
  amount: decimal.nullable().optional(),
  currency,
  status: z.enum(['CONFIRMED', 'UNVERIFIED', 'UNKNOWN']),
  sourceType: z.enum(['BROKER_IMPORT', 'TRANSACTION_METADATA', 'MANUAL', 'OTHER_CANONICAL']),
  sourceReference: reference,
});
export type RecordWithholdingBody = z.infer<typeof RecordWithholdingBodySchema>;

export const RecordFiiMetadataBodySchema = z.object({
  assetId: z.string().uuid(),
  asOfDate: civilDate,
  holderCount: z.number().int().min(0).nullable().optional(),
  investorOwnershipPercent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,18})?$/)
    .nullable()
    .optional(),
  isExchangeTraded: z.boolean().nullable().optional(),
  sourceType: z.enum([
    'OFFICIAL_FUND_DATA',
    'BROKER_IMPORT',
    'MANUAL_CONFIRMED',
    'OTHER_CANONICAL',
  ]),
  sourceReference: reference,
  status: z.enum(['KNOWN', 'PARTIAL', 'UNKNOWN']),
});
export type RecordFiiMetadataBody = z.infer<typeof RecordFiiMetadataBodySchema>;

export const ResolveTaxInputConflictBodySchema = z.object({
  action: z.enum(['KEEP_EXISTING', 'ACCEPT_NEW']),
  resolutionSource: z.string().min(1).max(255).optional(),
});
export type ResolveTaxInputConflictBody = z.infer<typeof ResolveTaxInputConflictBodySchema>;

// Phase 4G.2A.1b — compensation election for exempt-month normal-loss recognition.
export const PutEquityExemptLossElectionBodySchema = z.object({
  value: z.enum(['DECLARE_FOR_CARRYFORWARD', 'DO_NOT_DECLARE']),
});
export type PutEquityExemptLossElectionBody = z.infer<typeof PutEquityExemptLossElectionBodySchema>;
