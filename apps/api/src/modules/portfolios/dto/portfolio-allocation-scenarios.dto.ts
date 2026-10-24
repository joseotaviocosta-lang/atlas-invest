import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { STRATEGY_CATEGORIES } from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-E — saved scenario DTOs. Strict: the client supplies ONLY the
 * declared hypothesis (name + per-category hypothetical amounts).
 * Current allocation, targets, weights, currency and results are never
 * accepted — the server loads them and recomputes live.
 */
export const SavedScenarioChangeSchema = z
  .object({
    category: z.enum(STRATEGY_CATEGORIES as unknown as [string, ...string[]]),
    amount: z.string().min(1).max(32),
  })
  .strict();

export const SaveAllocationScenarioBodySchema = z
  .object({
    name: z.string().min(1).max(80),
    type: z.literal('CONTRIBUTION'),
    changes: z.array(SavedScenarioChangeSchema).min(1).max(20),
  })
  .strict();

export type SaveAllocationScenarioBody = z.infer<typeof SaveAllocationScenarioBodySchema>;

export const CompareAllocationScenariosBodySchema = z
  .object({
    scenarioIds: z
      .tuple([z.string().uuid(), z.string().uuid()])
      .refine(([first, second]) => first !== second, {
        message: 'scenarioIds must be two distinct scenarios',
      }),
  })
  .strict();

export type CompareAllocationScenariosBody = z.infer<typeof CompareAllocationScenariosBodySchema>;

export class SavedScenarioChangeSwaggerDto {
  @ApiProperty({ type: String, enum: [...STRATEGY_CATEGORIES], example: 'FIXED_INCOME' })
  category!: string;

  @ApiProperty({
    type: String,
    example: '10.000,50',
    description: 'Hypothetical amount in pt-BR or plain form',
  })
  amount!: string;
}

export class SaveAllocationScenarioSwaggerDto {
  @ApiProperty({ type: String, example: 'Aporte de novembro', maxLength: 80 })
  name!: string;

  @ApiProperty({ type: String, enum: ['CONTRIBUTION'], example: 'CONTRIBUTION' })
  type!: string;

  @ApiProperty({ type: [SavedScenarioChangeSwaggerDto] })
  changes!: SavedScenarioChangeSwaggerDto[];
}

export class CompareAllocationScenariosSwaggerDto {
  @ApiProperty({
    type: [String],
    example: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    description: 'Exactly two distinct saved scenario IDs',
  })
  scenarioIds!: string[];
}
