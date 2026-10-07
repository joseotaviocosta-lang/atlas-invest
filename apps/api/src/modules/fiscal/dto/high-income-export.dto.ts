import { z } from 'zod';

/**
 * Phase 4I.6 — Export query for the high-income annual review support document.
 *
 * `format` is optional; the controller defaults it to `csv` (the human-readable
 * support document). An invalid format fails with 400 `VALIDATION.INVALID_INPUT`
 * via the existing `ZodValidationPipe`.
 */
export const HighIncomeExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional(),
});

export type HighIncomeExportQuery = z.infer<typeof HighIncomeExportQuerySchema>;
