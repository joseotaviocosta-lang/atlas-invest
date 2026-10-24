import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { STRATEGY_CATEGORIES } from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-C — strategy write model. Strict: unknown fields rejected,
 * categories limited to the allocation engine vocabulary, weights are
 * integer basis points (0..10000). The frontend parses locale input
 * ('25,5' → 2550); the backend re-validates everything and enforces the
 * exact 100% total before any write.
 */
export const AllocationStrategyTargetSchema = z.object({
  category: z.enum(STRATEGY_CATEGORIES as unknown as [string, ...string[]]),
  targetBp: z.number().int().min(0).max(10000),
});

export const PutAllocationStrategyBodySchema = z
  .object({
    targets: z.array(AllocationStrategyTargetSchema).min(1).max(20),
  })
  .strict();

export type PutAllocationStrategyBody = z.infer<typeof PutAllocationStrategyBodySchema>;

export class AllocationStrategyTargetSwaggerDto {
  @ApiProperty({ type: String, enum: [...STRATEGY_CATEGORIES], example: 'FIXED_INCOME' })
  category!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 10000, example: 4000 })
  targetBp!: number;
}

export class PutAllocationStrategySwaggerDto {
  @ApiProperty({ type: [AllocationStrategyTargetSwaggerDto] })
  targets!: AllocationStrategyTargetSwaggerDto[];
}

export class AllocationStrategyComparisonSwaggerDto {
  @ApiPropertyOptional({ type: String })
  portfolioId?: string;
}

/**
 * Phase 5Q-D — scenario simulate model. Strict: the user supplies ONLY
 * hypothetical changes (category + locale money string). Current values,
 * projected values, targets, currency, provider, source and portfolioId
 * are never accepted from the client — the server is the authority.
 */
export const AllocationScenarioChangeSchema = z
  .object({
    category: z.enum(STRATEGY_CATEGORIES as unknown as [string, ...string[]]),
    amount: z.string().min(1).max(32),
  })
  .strict();

export const SimulateAllocationScenarioBodySchema = z
  .object({
    type: z.literal('CONTRIBUTION'),
    changes: z.array(AllocationScenarioChangeSchema).min(1).max(20),
  })
  .strict();

export type SimulateAllocationScenarioBody = z.infer<typeof SimulateAllocationScenarioBodySchema>;

export class AllocationScenarioChangeSwaggerDto {
  @ApiProperty({ type: String, enum: [...STRATEGY_CATEGORIES], example: 'FIXED_INCOME' })
  category!: string;

  @ApiProperty({
    type: String,
    example: '10.000,50',
    description: 'Hypothetical amount in pt-BR or plain form',
  })
  amount!: string;
}

export class SimulateAllocationScenarioSwaggerDto {
  @ApiProperty({ type: String, enum: ['CONTRIBUTION'], example: 'CONTRIBUTION' })
  type!: string;

  @ApiProperty({ type: [AllocationScenarioChangeSwaggerDto] })
  changes!: AllocationScenarioChangeSwaggerDto[];
}
