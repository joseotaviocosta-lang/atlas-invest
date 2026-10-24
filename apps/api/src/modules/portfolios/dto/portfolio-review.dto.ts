import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ReviewPeriodQuerySchema = z.object({
  period: z.enum(['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION']).default('1A'),
});

export type ReviewPeriodQuery = z.infer<typeof ReviewPeriodQuerySchema>;

export class ReviewPeriodQuerySwaggerDto {
  @ApiPropertyOptional({
    type: String,
    enum: ['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION'],
    default: '1A',
    description: 'Analysis window presets; unknown values are rejected with 400',
  })
  period?: string;
}
