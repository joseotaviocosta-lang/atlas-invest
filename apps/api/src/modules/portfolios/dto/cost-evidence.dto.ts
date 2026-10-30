import { z } from 'zod';
import {
  UUIDSchema,
  CurrencySchema,
  LocalDateSchema,
  DecimalStringSchema,
} from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CostEvidenceTypeSchema = z.enum([
  'BROKERAGE_NOTE',
  'BROKER_STATEMENT',
  'ANNUAL_TAX_STATEMENT',
  'OFFICIAL_POSITION_REPORT',
  'MANUAL_DOCUMENTED',
]);

export const CostEvidenceCreateSchema = z.object({
  accountId: UUIDSchema,
  assetId: UUIDSchema,
  evidenceType: CostEvidenceTypeSchema,
  quantityCovered: DecimalStringSchema,
  unitCost: DecimalStringSchema.optional(),
  totalCost: DecimalStringSchema.optional(),
  currency: CurrencySchema,
  acquisitionDate: LocalDateSchema,
  evidenceDate: LocalDateSchema.optional(),
  sourceReference: z.string().trim().min(1).max(255),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(['DRAFT', 'REVIEW_REQUIRED']).optional(),
});

export type CostEvidenceCreateBody = z.infer<typeof CostEvidenceCreateSchema>;

export const CostEvidenceReviseSchema = z.object({
  accountId: UUIDSchema.optional(),
  assetId: UUIDSchema.optional(),
  evidenceType: CostEvidenceTypeSchema.optional(),
  quantityCovered: DecimalStringSchema.optional(),
  unitCost: DecimalStringSchema.optional(),
  totalCost: DecimalStringSchema.optional(),
  currency: CurrencySchema.optional(),
  acquisitionDate: LocalDateSchema.optional(),
  evidenceDate: LocalDateSchema.optional(),
  sourceReference: z.string().trim().min(1).max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type CostEvidenceReviseBody = z.infer<typeof CostEvidenceReviseSchema>;

export const CostEvidenceRejectSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CostEvidenceRejectBody = z.infer<typeof CostEvidenceRejectSchema>;

export const CostEvidenceListQuerySchema = z.object({
  accountId: UUIDSchema.optional(),
  assetId: UUIDSchema.optional(),
  statuses: z.string().trim().optional(),
});

export type CostEvidenceListQuery = z.infer<typeof CostEvidenceListQuerySchema>;

export const CostAssessmentQuerySchema = z.object({
  accountId: UUIDSchema,
  assetId: UUIDSchema,
});

export type CostAssessmentQuery = z.infer<typeof CostAssessmentQuerySchema>;

export class CostEvidenceSwaggerDto {
  @ApiProperty({ type: String, example: '22222222-2222-4222-8222-222222222222' })
  accountId!: string;

  @ApiProperty({ type: String, example: '44444444-4444-4444-8444-444444444444' })
  assetId!: string;

  @ApiProperty({ enum: ['BROKERAGE_NOTE', 'BROKER_STATEMENT', 'ANNUAL_TAX_STATEMENT', 'OFFICIAL_POSITION_REPORT', 'MANUAL_DOCUMENTED'] })
  evidenceType!: string;

  @ApiProperty({ type: String, example: '120', description: 'Strict decimal string, > 0' })
  quantityCovered!: string;

  @ApiPropertyOptional({ type: String, example: '8.50' })
  unitCost?: string;

  @ApiPropertyOptional({ type: String, example: '1020.00' })
  totalCost?: string;

  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({ type: String, example: '2024-12-26', description: 'Exact civil acquisition date' })
  acquisitionDate!: string;

  @ApiPropertyOptional({ type: String, example: '2025-03-31' })
  evidenceDate?: string;

  @ApiProperty({ type: String, example: 'XP-NOTA-2024-1234', description: 'Stable document identifier, never a filesystem path' })
  sourceReference!: string;

  @ApiPropertyOptional({ type: String, example: 'Nota de corretagem XP, pregão 26/12/2024' })
  notes?: string;
}
