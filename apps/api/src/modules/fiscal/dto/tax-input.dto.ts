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
