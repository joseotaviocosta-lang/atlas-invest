import { z } from 'zod';
import { TAX_COMPLIANCE_CLOSE_SCOPES } from '@atlas/tax-engine';

export const TaxCompliancePeriodCloseScopeSchema = z.enum(TAX_COMPLIANCE_CLOSE_SCOPES);

const calendarYearField = z.coerce.number().int().min(1900).max(2100);

const monthField = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM')
  .refine(
    (month) => {
      const m = parseInt(month.slice(5, 7), 10);
      return m >= 1 && m <= 12;
    },
    { message: 'Must be a valid calendar month (YYYY-MM)' },
  );

export const PeriodCloseReadinessQuerySchema = z
  .object({
    scope: TaxCompliancePeriodCloseScopeSchema,
    calendarYear: calendarYearField,
    month: monthField.optional(),
    exercise: z.coerce.number().int().min(1900).max(2100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'MONTHLY') {
      if (!value.month) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'month is required for MONTHLY scope',
        });
      } else if (!value.month.startsWith(`${value.calendarYear}-`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'month must belong to calendarYear',
        });
      }
      if (value.exercise !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exercise must not be provided for MONTHLY scope',
        });
      }
    } else {
      if (value.exercise === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exercise is required for ANNUAL scope',
        });
      } else if (value.exercise !== value.calendarYear + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exercise must equal calendarYear + 1',
        });
      }
      if (value.month !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'month must not be provided for ANNUAL scope',
        });
      }
    }
  });

export type PeriodCloseReadinessQueryDto = z.infer<typeof PeriodCloseReadinessQuerySchema>;

export const PeriodCloseBodySchema = PeriodCloseReadinessQuerySchema;

export type PeriodCloseBodyDto = z.infer<typeof PeriodCloseBodySchema>;

export const PeriodCloseReopenBodySchema = z.object({
  reason: z.string().trim().min(1).max(280),
});

export type PeriodCloseReopenBodyDto = z.infer<typeof PeriodCloseReopenBodySchema>;

export const PeriodCloseHistoryQuerySchema = z.object({
  scope: TaxCompliancePeriodCloseScopeSchema.optional(),
  period: z
    .string()
    .regex(/^\d{4}(-\d{2})?$/, 'Must be YYYY or YYYY-MM')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PeriodCloseHistoryQueryDto = z.infer<typeof PeriodCloseHistoryQuerySchema>;

export const PeriodCloseExportQuerySchema = z
  .object({
    scope: TaxCompliancePeriodCloseScopeSchema,
    calendarYear: calendarYearField,
    month: monthField.optional(),
    exercise: z.coerce.number().int().min(1900).max(2100).optional(),
    format: z.enum(['json', 'csv']).default('csv'),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'MONTHLY') {
      if (!value.month) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'month is required for MONTHLY scope',
        });
      } else if (!value.month.startsWith(`${value.calendarYear}-`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'month must belong to calendarYear',
        });
      }
      if (value.exercise !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exercise must not be provided for MONTHLY scope',
        });
      }
    } else {
      if (value.exercise === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exercise is required for ANNUAL scope',
        });
      } else if (value.exercise !== value.calendarYear + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exercise must equal calendarYear + 1',
        });
      }
      if (value.month !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'month must not be provided for ANNUAL scope',
        });
      }
    }
  });

export type PeriodCloseExportQueryDto = z.infer<typeof PeriodCloseExportQuerySchema>;
