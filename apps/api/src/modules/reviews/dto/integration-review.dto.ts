import { z } from 'zod';
import { UUIDSchema } from '@atlas/validation';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const IntegrationReviewListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: UUIDSchema.optional(),
  severity: z.enum(['REVIEW', 'WARNING', 'ERROR']).optional(),
  portfolioId: UUIDSchema.optional(),
});

export type IntegrationReviewListQuery = z.infer<typeof IntegrationReviewListQuerySchema>;

export class IntegrationReviewListQuerySwaggerDto {
  @ApiPropertyOptional({ type: Number, description: 'Page size (1-200)', default: 50 })
  limit?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Opaque cursor (run id of the last seen page)',
  })
  cursor?: string;

  @ApiPropertyOptional({ type: String, enum: ['REVIEW', 'WARNING', 'ERROR'] })
  severity?: string;

  @ApiPropertyOptional({ type: String, description: 'Scope to one owned portfolio' })
  portfolioId?: string;
}
