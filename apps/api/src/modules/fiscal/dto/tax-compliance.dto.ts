import { z } from 'zod';
import {
  TAX_COMPLIANCE_OBLIGATION_KINDS,
  TAX_COMPLIANCE_OBLIGATION_STATUSES,
  TAX_COMPLIANCE_USER_ACTION_TYPES,
} from '@atlas/tax-engine';

export const TaxComplianceTimelineQuerySchema = z
  .object({
    calendarYear: z.coerce.number().int().min(1900).max(2100).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    status: z.enum(TAX_COMPLIANCE_OBLIGATION_STATUSES).optional(),
    kind: z.enum(TAX_COMPLIANCE_OBLIGATION_KINDS).optional(),
    period: z.string().optional(),
    portfolioId: z.string().uuid().optional(),
  })
  .transform((data) => ({
    ...data,
    calendarYear: data.calendarYear ?? data.year,
  }));

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

export const RecordTaxPaymentEvidenceBodySchema = z.object({
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  amountReported: z.string().regex(/^\d+(\.\d{1,18})?$/, 'Must be valid positive decimal string'),
  revenueCodeReported: z.string().min(1).max(16).optional(),
  referencePeriod: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM'),
  externalReference: z.string().max(255).optional(),
  note: z.string().max(1000).optional(),
});

export type RecordTaxPaymentEvidenceBodyDto = z.infer<typeof RecordTaxPaymentEvidenceBodySchema>;

export const PaymentSupportExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export type PaymentSupportExportQueryDto = z.infer<typeof PaymentSupportExportQuerySchema>;
