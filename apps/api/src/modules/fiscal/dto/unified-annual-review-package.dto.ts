import { z } from 'zod';

/**
 * Phase 4J.2 — unified annual review-package param guard.
 *
 * NEW DTO (not the 4J.1 `UnifiedAnnualParamSchema` reused) so the package
 * surface can evolve independently. Structural only (must be an integer); the
 * out-of-range year is rejected by the service (`FISCAL.INVALID_YEAR`).
 */
export const UnifiedAnnualReviewPackageParamSchema = z.object({
  calendarYear: z.coerce.number().int(),
});

export type UnifiedAnnualReviewPackageParam = z.infer<typeof UnifiedAnnualReviewPackageParamSchema>;

/**
 * Phase 4J.2 — unified annual review-package export query guard.
 *
 * `format` is optional and defaults to `csv` in the handler. Any other value
 * (e.g. `?format=pdf`) is rejected with `VALIDATION.INVALID_INPUT`.
 */
export const UnifiedAnnualReviewPackageExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional(),
});

export type UnifiedAnnualReviewPackageExportQuery = z.infer<
  typeof UnifiedAnnualReviewPackageExportQuerySchema
>;
