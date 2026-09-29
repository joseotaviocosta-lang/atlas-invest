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
