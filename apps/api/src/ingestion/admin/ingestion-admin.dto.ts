/**
 * Phase 5E (R3-C) - Strict admin DTOs.
 *
 * Only an allowlisted job type and an optional civil date are accepted. There is
 * deliberately no provider, URL, SGS code, range or free-form parameter field,
 * so SSRF/custom-provider injection is structurally impossible.
 */

import { z } from 'zod';
import { INGESTION_JOB_TYPES, IngestionJobType } from '../job-types';

const JOB_TYPE_VALUES = [...INGESTION_JOB_TYPES] as [IngestionJobType, ...IngestionJobType[]];

export const RunIngestionJobBodySchema = z
  .object({
    scheduledFor: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'scheduledFor must use YYYY-MM-DD')
      .optional(),
  })
  .strict();

export type RunIngestionJobBodyDto = z.infer<typeof RunIngestionJobBodySchema>;

export const ListIngestionJobsQuerySchema = z
  .object({
    jobType: z.enum(JOB_TYPE_VALUES).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type ListIngestionJobsQueryDto = z.infer<typeof ListIngestionJobsQuerySchema>;

export const IngestionJobIdParamSchema = z.string().uuid('id must be a valid UUID');
