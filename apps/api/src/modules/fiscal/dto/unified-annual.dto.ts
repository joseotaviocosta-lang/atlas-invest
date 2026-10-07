import { z } from 'zod';

/**
 * Phase 4J.1 — unified annual IRPF param guard.
 *
 * NEW DTO (not the 4I high-income schema reused) so it can evolve independently.
 * Structural only (must be an integer); the out-of-range year is rejected by the
 * service (`FISCAL.INVALID_YEAR`). Defined identically to
 * `AnnualHighIncomeParamSchema` today.
 */
export const UnifiedAnnualParamSchema = z.object({
  calendarYear: z.coerce.number().int(),
});

export type UnifiedAnnualParam = z.infer<typeof UnifiedAnnualParamSchema>;
