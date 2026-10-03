import { z } from 'zod';

export const AnnualTaxReportingParamSchema = z.object({
  calendarYear: z.coerce.number().int().min(1900).max(2100),
});

export type AnnualTaxReportingParam = z.infer<typeof AnnualTaxReportingParamSchema>;
