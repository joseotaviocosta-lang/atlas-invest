import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Phase 5Q-J — contribution goal DTO. Strict: the client declares ONLY
 * the monthly amount and the effective month. Currency, status, history,
 * planned/confirmed totals and recommendations are never accepted — the
 * server owns them.
 */
const GoalMonthSchema = z
  .string()
  .min(7)
  .max(7)
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'effectiveMonth must be a YYYY-MM month');

export const PutContributionGoalBodySchema = z
  .object({
    amount: z.string().min(1).max(32),
    effectiveMonth: GoalMonthSchema,
  })
  .strict();

export type PutContributionGoalBody = z.infer<typeof PutContributionGoalBodySchema>;

export class PutContributionGoalSwaggerDto {
  @ApiProperty({
    type: String,
    example: '3.000,00',
    description: 'User-declared monthly amount in pt-BR or plain form',
  })
  amount!: string;

  @ApiProperty({
    type: String,
    example: '2026-11',
    description: 'Effective month YYYY-MM (current or future; history is never rewritten)',
  })
  effectiveMonth!: string;
}
