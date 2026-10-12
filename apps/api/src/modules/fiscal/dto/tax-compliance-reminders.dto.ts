import { z } from 'zod';
import {
  TAX_COMPLIANCE_REMINDER_KINDS,
  TAX_COMPLIANCE_REMINDER_STATUSES,
  TAX_COMPLIANCE_REMINDER_ACTION_TYPES,
  TAX_COMPLIANCE_REMINDER_CHANNELS,
} from '@atlas/tax-engine';

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const TaxComplianceRemindersQuerySchema = z.object({
  calendarYear: z.coerce.number().int().min(1900).max(2100).optional(),
  status: z.enum(TAX_COMPLIANCE_REMINDER_STATUSES).optional(),
  kind: z.enum(TAX_COMPLIANCE_REMINDER_KINDS).optional(),
  triggerFrom: civilDate.optional(),
  triggerTo: civilDate.optional(),
});

export type TaxComplianceRemindersQueryDto = z.infer<typeof TaxComplianceRemindersQuerySchema>;

export const TaxComplianceReminderParamSchema = z.object({
  reminderKey: z.string().min(1).max(512),
});

export type TaxComplianceReminderParamDto = z.infer<typeof TaxComplianceReminderParamSchema>;

export const RecordTaxReminderActionBodySchema = z
  .object({
    actionType: z.enum(TAX_COMPLIANCE_REMINDER_ACTION_TYPES),
    obligationKey: z.string().min(1).max(255),
    reminderKind: z.enum(TAX_COMPLIANCE_REMINDER_KINDS),
    triggerAt: civilDate,
    sourceFingerprint: z.string().min(1).max(64),
    snoozedUntil: civilDate.optional(),
    note: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.actionType === 'SNOOZE' && !data.snoozedUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'snoozedUntil is required for SNOOZE actions',
        path: ['snoozedUntil'],
      });
    }
    if (data.actionType !== 'SNOOZE' && data.snoozedUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'snoozedUntil is only allowed for SNOOZE actions',
        path: ['snoozedUntil'],
      });
    }
  });

export type RecordTaxReminderActionBodyDto = z.infer<typeof RecordTaxReminderActionBodySchema>;

export const RecordTaxNotificationDeliveryBodySchema = z.object({
  sourceFingerprint: z.string().min(1).max(64),
  channel: z.enum(TAX_COMPLIANCE_REMINDER_CHANNELS).default('IN_APP'),
  triggerAt: civilDate,
});

export type RecordTaxNotificationDeliveryBodyDto = z.infer<
  typeof RecordTaxNotificationDeliveryBodySchema
>;

export const TaxReminderPreferencesBodySchema = z.object({
  remindersEnabled: z.boolean(),
  upcomingEnabled: z.boolean(),
  overdueEnabled: z.boolean(),
  annualEnabled: z.boolean(),
  leadTimes: z.array(z.number().int().min(1).max(30)).max(5),
});

export type TaxReminderPreferencesBodyDto = z.infer<typeof TaxReminderPreferencesBodySchema>;
