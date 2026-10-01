import { z } from 'zod';

export const AnnualPositionsQuerySchema = z.object({
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
});

export type AnnualPositionsQuery = z.infer<typeof AnnualPositionsQuerySchema>;

export const ListAnnualOpeningPositionsQuerySchema = z.object({
  portfolioId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'SUPERSEDED']).optional(),
});

export type ListAnnualOpeningPositionsQuery = z.infer<typeof ListAnnualOpeningPositionsQuerySchema>;

export const RecordAnnualOpeningPositionBodySchema = z.object({
  portfolioId: z.string().uuid({ message: 'portfolioId must be a valid UUID' }),
  accountId: z.string().uuid({ message: 'accountId must be a valid UUID' }),
  assetId: z.string().uuid({ message: 'assetId must be a valid UUID' }),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must be in YYYY-MM-DD format' }),
  quantity: z.string().min(1, { message: 'quantity is required' }),
  totalHistoricalCost: z.string().min(1, { message: 'totalHistoricalCost is required' }),
  currency: z.string().length(3, { message: 'currency must be a 3-letter ISO code' }),
  source: z.enum([
    'MANUAL_CONFIRMED',
    'MANUAL_DRAFT',
    'BROKERAGE_NOTE',
    'IMPORTED_PRIOR_DECLARATION',
    'SYSTEM_RECONCILED',
  ]),
  status: z.enum(['DRAFT', 'CONFIRMED']).optional(),
  notes: z.string().optional(),
});

export type RecordAnnualOpeningPositionBody = z.infer<typeof RecordAnnualOpeningPositionBodySchema>;
