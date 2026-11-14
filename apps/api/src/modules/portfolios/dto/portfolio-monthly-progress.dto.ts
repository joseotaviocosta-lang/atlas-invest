import { ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const MonthlyProgressQuerySchema = z
  .object({
    from: z
      .string()
      .trim()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: 'from must be in YYYY-MM format.',
      })
      .optional(),
    to: z
      .string()
      .trim()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: 'to must be in YYYY-MM format.',
      })
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.from && data.to) {
        return data.from <= data.to;
      }
      return true;
    },
    {
      message: 'from cannot be after to.',
      path: ['from'],
    },
  )
  .refine(
    (data) => {
      if (data.from && data.to) {
        const [fY, fM] = data.from.split('-').map(Number);
        const [tY, tM] = data.to.split('-').map(Number);
        const count = (tY! - fY!) * 12 + (tM! - fM!) + 1;
        return count <= 60;
      }
      return true;
    },
    {
      message: 'Requested range exceeds maximum limit of 60 months.',
      path: ['to'],
    },
  );

export type MonthlyProgressQuery = z.infer<typeof MonthlyProgressQuerySchema>;

export class MonthlyProgressQuerySwaggerDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Start month in YYYY-MM format (inclusive)',
    example: '2025-12',
  })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'End month in YYYY-MM format (inclusive)',
    example: '2026-11',
  })
  to?: string;
}
