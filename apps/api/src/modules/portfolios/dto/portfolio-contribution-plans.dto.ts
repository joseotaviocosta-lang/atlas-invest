import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { STRATEGY_CATEGORIES } from '@atlas/portfolio-strategy';

/**
 * Phase 5Q-F — contribution plan DTOs. Strict: the client declares ONLY
 * the intent (name, date-only plannedDate, per-category amounts, optional
 * source scenario). Status, currency, totals, results, transactions and
 * execution fields are never accepted — the server owns them.
 */
export const ContributionPlanItemSchema = z
  .object({
    category: z.enum(STRATEGY_CATEGORIES as unknown as [string, ...string[]]),
    amount: z.string().min(1).max(32),
  })
  .strict();

const PlanDateSchema = z
  .string()
  .min(10)
  .max(10)
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'plannedDate must be a date-only YYYY-MM-DD');

export const CreateContributionPlanBodySchema = z
  .object({
    name: z.string().min(1).max(80),
    plannedDate: PlanDateSchema,
    items: z.array(ContributionPlanItemSchema).min(1).max(20),
    sourceScenarioId: z.string().uuid().optional(),
  })
  .strict();

export type CreateContributionPlanBody = z.infer<typeof CreateContributionPlanBodySchema>;

export const UpdateContributionPlanBodySchema = z
  .object({
    name: z.string().min(1).max(80),
    plannedDate: PlanDateSchema,
    items: z.array(ContributionPlanItemSchema).min(1).max(20),
  })
  .strict();

export type UpdateContributionPlanBody = z.infer<typeof UpdateContributionPlanBodySchema>;

export class ContributionPlanItemSwaggerDto {
  @ApiProperty({ type: String, enum: [...STRATEGY_CATEGORIES], example: 'FIXED_INCOME' })
  category!: string;

  @ApiProperty({
    type: String,
    example: '3.000,00',
    description: 'Declared amount in pt-BR or plain form',
  })
  amount!: string;
}

export class CreateContributionPlanSwaggerDto {
  @ApiProperty({ type: String, example: 'Aporte de novembro', maxLength: 80 })
  name!: string;

  @ApiProperty({ type: String, example: '2026-11-10', description: 'Date-only YYYY-MM-DD' })
  plannedDate!: string;

  @ApiProperty({ type: [ContributionPlanItemSwaggerDto] })
  items!: ContributionPlanItemSwaggerDto[];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Optional saved-scenario provenance (copied inputs only)',
  })
  sourceScenarioId?: string;
}

export class UpdateContributionPlanSwaggerDto {
  @ApiProperty({ type: String, example: 'Aporte de novembro', maxLength: 80 })
  name!: string;

  @ApiProperty({ type: String, example: '2026-11-10', description: 'Date-only YYYY-MM-DD' })
  plannedDate!: string;

  @ApiProperty({ type: [ContributionPlanItemSwaggerDto] })
  items!: ContributionPlanItemSwaggerDto[];
}

export const PlanTrackingLinkBodySchema = z
  .object({
    transactionId: z.string().uuid(),
  })
  .strict();

export type PlanTrackingLinkBody = z.infer<typeof PlanTrackingLinkBodySchema>;

export class PlanTrackingLinkSwaggerDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Ledger transaction to link' })
  transactionId!: string;
}
