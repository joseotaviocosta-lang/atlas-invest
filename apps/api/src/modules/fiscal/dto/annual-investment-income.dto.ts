import { z } from 'zod';

export const AnnualInvestmentIncomeParamSchema = z.object({
  calendarYear: z.coerce
    .number()
    .int()
    .min(1900, { message: 'calendarYear must be >= 1900' })
    .max(2100, { message: 'calendarYear must be <= 2100' }),
});

export type AnnualInvestmentIncomeParam = z.infer<typeof AnnualInvestmentIncomeParamSchema>;
