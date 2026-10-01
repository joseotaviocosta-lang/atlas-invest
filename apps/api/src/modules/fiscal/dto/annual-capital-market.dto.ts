import { z } from 'zod';

export const AnnualCapitalMarketParamSchema = z.object({
  calendarYear: z.coerce
    .number()
    .int()
    .min(1900, { message: 'calendarYear must be >= 1900' })
    .max(2100, { message: 'calendarYear must be <= 2100' }),
});

export type AnnualCapitalMarketParam = z.infer<typeof AnnualCapitalMarketParamSchema>;
