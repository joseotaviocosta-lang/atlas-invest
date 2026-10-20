/**
 * Phase 5G - Strict operations DTOs. Only bounded filters, no provider
 * control, no SQL, no job implementation selection.
 */

import { z } from 'zod';

export const OperationsJobsHealthQuerySchema = z.object({}).strict();

export type OperationsJobsHealthQueryDto = z.infer<typeof OperationsJobsHealthQuerySchema>;

export const OperationsAlertsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    status: z.enum(['ACTIVE', 'RESOLVED']).optional(),
  })
  .strict();

export type OperationsAlertsQueryDto = z.infer<typeof OperationsAlertsQuerySchema>;

export const OperationsAlertIdParamSchema = z.string().uuid('id must be a valid UUID');

export const OperationsMetricsQuerySchema = z.object({}).strict();

export type OperationsMetricsQueryDto = z.infer<typeof OperationsMetricsQuerySchema>;

export const SchedulerReadinessQuerySchema = z.object({}).strict();

export type SchedulerReadinessQueryDto = z.infer<typeof SchedulerReadinessQuerySchema>;
