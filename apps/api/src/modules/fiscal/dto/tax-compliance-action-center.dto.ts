import { z } from 'zod';
import {
  TAX_COMPLIANCE_ACTION_ITEM_KINDS,
  TAX_COMPLIANCE_OPERATIONAL_STATUSES,
  TAX_COMPLIANCE_PRIORITIES,
  TAX_COMPLIANCE_CALENDAR_EVENT_TYPES,
} from '@atlas/tax-engine';

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const TaxComplianceActionCenterQuerySchema = z.object({
  calendarYear: z.coerce.number().int().min(1900).max(2100).optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM')
    .optional(),
  status: z.enum(TAX_COMPLIANCE_OPERATIONAL_STATUSES).optional(),
  priority: z.enum(TAX_COMPLIANCE_PRIORITIES).optional(),
  kind: z.enum(TAX_COMPLIANCE_ACTION_ITEM_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type TaxComplianceActionCenterQueryDto = z.infer<
  typeof TaxComplianceActionCenterQuerySchema
>;

export const TaxComplianceCalendarQuerySchema = z.object({
  calendarYear: z.coerce.number().int().min(1900).max(2100).optional(),
  from: civilDate.optional(),
  to: civilDate.optional(),
  eventType: z.enum(TAX_COMPLIANCE_CALENDAR_EVENT_TYPES).optional(),
  status: z.string().min(1).max(50).optional(),
});

export type TaxComplianceCalendarQueryDto = z.infer<typeof TaxComplianceCalendarQuerySchema>;
