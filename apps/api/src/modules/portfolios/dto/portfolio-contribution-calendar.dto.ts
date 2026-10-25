import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 5Q-K — contribution calendar query DTO. Both bounds are optional
 * `YYYY-MM` months; omitted bounds default to the current calendar year
 * server-side. Strict: nothing else is accepted.
 */
const CalendarMonthSchema = z
  .string()
  .min(7)
  .max(7)
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'from/to must be a YYYY-MM month');

export const ContributionCalendarQuerySchema = z
  .object({
    from: CalendarMonthSchema.optional(),
    to: CalendarMonthSchema.optional(),
  })
  .strict();

export type ContributionCalendarQuery = z.infer<typeof ContributionCalendarQuerySchema>;

export class ContributionCalendarQuerySwaggerDto {
  @ApiPropertyOptional({
    type: String,
    example: '2026-01',
    description: 'First month YYYY-MM (defaults to January of the current year)',
  })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-12',
    description: 'Last month YYYY-MM (defaults to December of the current year)',
  })
  to?: string;
}
