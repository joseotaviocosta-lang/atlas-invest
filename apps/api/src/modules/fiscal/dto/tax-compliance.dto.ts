import { z } from 'zod';
import {
  TAX_COMPLIANCE_OBLIGATION_KINDS,
  TAX_COMPLIANCE_OBLIGATION_STATUSES,
  TAX_COMPLIANCE_USER_ACTION_TYPES,
} from '@atlas/tax-engine';

export const TaxComplianceTimelineQuerySchema = z.object({
  calendarYear: z.coerce.number().int().optional(),
  status: z.enum(TAX_COMPLIANCE_OBLIGATION_STATUSES).optional(),
  kind: z.enum(TAX_COMPLIANCE_OBLIGATION_KINDS).optional(),
  period: z.string().optional(),
});

export type TaxComplianceTimelineQueryDto = z.infer<typeof TaxComplianceTimelineQuerySchema>;

export const TaxComplianceActionParamSchema = z.object({
  obligationKey: z.string().min(1).max(255),
});

export type TaxComplianceActionParamDto = z.infer<typeof TaxComplianceActionParamSchema>;

export const RecordTaxComplianceActionBodySchema = z.object({
  actionType: z.enum(TAX_COMPLIANCE_USER_ACTION_TYPES),
  sourceFingerprint: z.string().min(1).max(64).optional(),
  note: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type RecordTaxComplianceActionBodyDto = z.infer<typeof RecordTaxComplianceActionBodySchema>;
