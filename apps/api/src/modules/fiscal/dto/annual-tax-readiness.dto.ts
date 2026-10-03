import { z } from 'zod';

export const AnnualTaxReadinessParamSchema = z.object({
  calendarYear: z.coerce.number().int().min(1900).max(2100),
});

export type AnnualTaxReadinessParam = z.infer<typeof AnnualTaxReadinessParamSchema>;

export const RecordTaxpayerConfirmationBodySchema = z.object({
  confirmationType: z.string().min(1).max(60),
  subjectReference: z.string().min(1).max(255),
  decision: z.string().min(1).max(30),
  statementVersion: z.string().min(1).max(30),
  sourceFingerprint: z.string().min(1).max(64),
  source: z.string().min(1).max(50),
  notes: z.string().max(2000).optional().nullable(),
});

export type RecordTaxpayerConfirmationBody = z.infer<typeof RecordTaxpayerConfirmationBodySchema>;
