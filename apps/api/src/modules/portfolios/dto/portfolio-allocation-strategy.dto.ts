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
