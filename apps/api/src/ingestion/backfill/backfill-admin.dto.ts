/**
 * Phase 5F (I3) - Strict backfill admin DTOs.
 *
 * Only domain + bounded civil range (+ explicit large-plan confirmation for
 * execution) are accepted. No provider, URL, SGS, currency-pair override or
 * unbounded range field exists, so SSRF/custom-provider injection is
 * structurally impossible.
 */

import { z } from 'zod';
import { BACKFILL_DOMAINS, BackfillDomain } from './backfill-types';

const DOMAIN_VALUES = [...BACKFILL_DOMAINS] as [BackfillDomain, ...BackfillDomain[]];

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from/to must use YYYY-MM-DD');

export const BackfillPlanBodySchema = z
  .object({
    domain: z.enum(DOMAIN_VALUES),
    from: civilDate,
    to: civilDate,
  })
  .strict();

export type BackfillPlanBodyDto = z.infer<typeof BackfillPlanBodySchema>;

export const BackfillRunBodySchema = z
  .object({
    domain: z.enum(DOMAIN_VALUES),
    from: civilDate,
    to: civilDate,
    confirmLargeBackfill: z.boolean().optional(),
  })
  .strict();

export type BackfillRunBodyDto = z.infer<typeof BackfillRunBodySchema>;
