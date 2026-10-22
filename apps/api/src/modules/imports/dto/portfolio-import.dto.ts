import { z } from 'zod';
import { UUIDSchema } from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MAX_CONTENT_CHARS = 3 * 1024 * 1024;

export const PreviewPortfolioImportBodySchema = z.object({
  sourceType: z.literal('GENERIC_CSV'),
  provider: z.string().trim().min(1).max(100).optional(),
  fileName: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(MAX_CONTENT_CHARS),
  defaultAccountId: UUIDSchema.optional(),
});

export type PreviewPortfolioImportBody = z.infer<typeof PreviewPortfolioImportBodySchema>;

export const ConfirmPortfolioImportBodySchema = PreviewPortfolioImportBodySchema.extend({
  decisions: z
    .array(
      z.object({
        rowNumber: z.number().int().positive(),
        action: z.enum(['import', 'skip']),
        assetId: UUIDSchema.optional(),
        accountId: UUIDSchema.optional(),
      }),
    )
    .max(2000)
    .default([]),
  runId: UUIDSchema.optional(),
});

export type ConfirmPortfolioImportBody = z.infer<typeof ConfirmPortfolioImportBodySchema>;

export class PreviewPortfolioImportSwaggerDto {
  @ApiProperty({ enum: ['GENERIC_CSV'], example: 'GENERIC_CSV' })
  sourceType!: string;

  @ApiPropertyOptional({ type: String, example: 'XP' })
  provider?: string;

  @ApiProperty({ type: String, example: 'operacoes-2025.csv' })
  fileName!: string;

  @ApiProperty({ type: String, description: 'Raw CSV content as text' })
  content!: string;

  @ApiPropertyOptional({ type: String, description: 'Default custody account UUID' })
  defaultAccountId?: string;
}

export class ConfirmPortfolioImportSwaggerDto extends PreviewPortfolioImportSwaggerDto {
  @ApiProperty({
    type: Array,
    description: 'Per-row decisions; omitted rows keep preview status',
    example: [{ rowNumber: 3, action: 'skip' }],
  })
  decisions!: Array<{
    rowNumber: number;
    action: 'import' | 'skip';
    assetId?: string;
    accountId?: string;
  }>;

  @ApiPropertyOptional({
    type: String,
    description: 'Operational run opened by preview; links confirmed rows to run history',
  })
  runId?: string;
}

export const IntegrationRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: UUIDSchema.optional(),
});

export type IntegrationRunListQuery = z.infer<typeof IntegrationRunListQuerySchema>;

export class IntegrationRunListQuerySwaggerDto {
  @ApiPropertyOptional({ type: Number, description: 'Page size (1-200)', default: 50 })
  limit?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Opaque cursor (run id of the last seen page)',
  })
  cursor?: string;
}
