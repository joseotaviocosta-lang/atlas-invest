import { z } from 'zod';

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimal = z.string().regex(/^\d{1,18}(\.\d{1,18})?$/);

/**
 * Phase 4C.2 — manual payment evidence body. Exact decimal string, civil date,
 * explicit currency. `MANUAL_CONFIRMED` is the only supported source.
 */
export const RecordTaxPaymentBodySchema = z.object({
  paidAt: civilDate,
  amount: decimal,
  currency: z.string().regex(/^[A-Z]{3}$/),
  sourceType: z.enum(['MANUAL_CONFIRMED']),
  sourceReference: z.string().min(1).max(255).optional(),
});
export type RecordTaxPaymentBody = z.infer<typeof RecordTaxPaymentBodySchema>;

export const ListTaxObligationsQuerySchema = z.object({
  competence: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  status: z
    .enum([
      'BLOCKED',
      'PROVISIONAL',
      'OPEN',
      'DUE',
      'OVERDUE',
      'PAID',
      'SUPERSEDED',
      'RECONCILIATION_REQUIRED',
      'NO_PAYMENT_DUE',
    ])
    .optional(),
  bucket: z.enum(['FII_SALE']).optional(),
});
export type ListTaxObligationsQuery = z.infer<typeof ListTaxObligationsQuerySchema>;

export const AdjustmentQuerySchema = z.object({
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type AdjustmentQuery = z.infer<typeof AdjustmentQuerySchema>;

/**
 * Phase 4E — settlement of an aggregated payable amount (current + carry
 * forward). Exact full payment only; `MANUAL_CONFIRMED` is the only source.
 */
export const SettleTaxPaymentAggregationBodySchema = z.object({
  paidAt: civilDate,
  amount: decimal,
  currency: z.string().regex(/^[A-Z]{3}$/),
  sourceType: z.enum(['MANUAL_CONFIRMED']),
  sourceReference: z.string().min(1).max(255).optional(),
});
export type SettleTaxPaymentAggregationBody = z.infer<typeof SettleTaxPaymentAggregationBodySchema>;

/**
 * Phase 4F — official DARF handoff preparation. Optional payment date drives the
 * 4D late-charge preview for overdue obligations. Atlas never generates the
 * official document.
 */
export const DarfHandoffBodySchema = z.object({
  paymentDate: civilDate.optional(),
});
export type DarfHandoffBody = z.infer<typeof DarfHandoffBodySchema>;

export const DarfReadinessQuerySchema = z.object({
  paymentDate: civilDate.optional(),
});
export type DarfReadinessQuery = z.infer<typeof DarfReadinessQuerySchema>;

export const ListDarfGenerationsQuerySchema = z.object({
  status: z
    .enum([
      'PREPARATION_READY',
      'USER_ACTION_REQUIRED',
      'GENERATING',
      'GENERATED',
      'FAILED',
      'SUPERSEDED',
      'EXPIRED',
      'BLOCKED',
    ])
    .optional(),
  obligationId: z.string().uuid().optional(),
});
export type ListDarfGenerationsQuery = z.infer<typeof ListDarfGenerationsQuerySchema>;

/**
 * Phase 4F — taxpayer identity boundary. The raw identifier is validated and
 * immediately reduced to a masked form + opaque reference; it is never stored.
 */
export const RecordTaxpayerIdentityBodySchema = z.object({
  identityType: z.enum(['CPF', 'CNPJ']),
  identifier: z.string().min(11).max(20),
});
export type RecordTaxpayerIdentityBody = z.infer<typeof RecordTaxpayerIdentityBodySchema>;
