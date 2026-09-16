import { z } from 'zod';
import { UUIDSchema, LocalDateSchema, TransactionTypeSchema } from '@atlas/validation';

export const ListTransactionsQuerySchema = z.object({
  accountId: UUIDSchema.optional(),
  assetId: UUIDSchema.optional(),
  type: TransactionTypeSchema.optional(),
  startDate: LocalDateSchema.optional(),
  endDate: LocalDateSchema.optional(),
  cursor: UUIDSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;
