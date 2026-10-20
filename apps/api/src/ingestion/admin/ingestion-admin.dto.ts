/**
 * Phase 5E (R3-C) - Strict admin DTOs.
 *
 * Only an allowlisted job type and an optional civil date are accepted. There is
 * deliberately no provider, URL, SGS code, range or free-form parameter field,
 * so SSRF/custom-provider injection is structurally impossible.
 */

import { z } from 'zod';
import {
  INGESTION_JOB_TYPES,
  JOB_STATUSES,
  TRIGGER_TYPES,
  type IngestionJobType,
  type JobStatus,
  type TriggerType,
} from '../job-types';

const JOB_TYPE_VALUES = [...INGESTION_JOB_TYPES] as [IngestionJobType, ...IngestionJobType[]];
const TRIGGER_VALUES = [...TRIGGER_TYPES] as [TriggerType, ...TriggerType[]];

const STATUS_VALUES = [...JOB_STATUSES] as [JobStatus, ...JobStatus[]];

const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'from/to must use YYYY-MM-DD')
  .refine(
    (value) => {
      const [y, m, d] = value.split('-').map(Number);
      if (y! < 1900 || y! > 2100 || m! < 1 || m! > 12 || d! < 1 || d! > 31) return false;
      const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
      return d! <= lastDay;
    },
    { message: 'from/to must be a real civil date YYYY-MM-DD' },
  );

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
    triggerType: z.enum(TRIGGER_VALUES).optional(),
    status: z.enum(STATUS_VALUES).optional(),
    from: civilDate.optional(),
    to: civilDate.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    { message: 'from must be <= to', path: ['from'] },
  );

export type ListIngestionJobsQueryDto = z.infer<typeof ListIngestionJobsQuerySchema>;

export const IngestionJobIdParamSchema = z.string().uuid('id must be a valid UUID');
