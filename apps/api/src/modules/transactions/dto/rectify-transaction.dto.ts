import { z } from 'zod';
import {
  UUIDSchema,
  LocalDateSchema,
  DecimalStringSchema,
  TransactionTypeSchema,
} from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const RectifyTransactionReplacementSchema = z
  .object({
    type: TransactionTypeSchema.optional(),
    accountId: UUIDSchema.optional(),
    assetId: UUIDSchema.optional(),
    quantity: DecimalStringSchema,
    unitPrice: DecimalStringSchema,
    fees: DecimalStringSchema.optional(),
    tradeDate: LocalDateSchema,
    notes: z.string().optional(),
  })
  .strict();

export type RectifyTransactionReplacementDto = z.infer<typeof RectifyTransactionReplacementSchema>;

export const RectifyTransactionBodySchema = z
  .object({
    mode: z.enum(['RECTIFY', 'CANCEL']).default('RECTIFY'),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().max(255).optional(),
    replacement: RectifyTransactionReplacementSchema.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.mode === 'RECTIFY' && !data.replacement) {
        return false;
      }
      return true;
    },
    {
      message: 'Replacement fields are required when mode is RECTIFY',
      path: ['replacement'],
    },
  );

export type RectifyTransactionBody = z.infer<typeof RectifyTransactionBodySchema>;

export class RectifyTransactionReplacementSwaggerDto {
  @ApiPropertyOptional({
    type: String,
    enum: ['BUY', 'SELL'],
    example: 'SELL',
  })
  type?: string;

  @ApiPropertyOptional({ type: String, example: '22222222-2222-4222-8222-222222222222' })
  accountId?: string;

  @ApiPropertyOptional({ type: String, example: '44444444-4444-4444-8444-444444444444' })
  assetId?: string;

  @ApiProperty({ type: String, example: '3' })
  quantity!: string;

  @ApiProperty({ type: String, example: '45.00' })
  unitPrice!: string;

  @ApiPropertyOptional({ type: String, example: '0.00' })
  fees?: string;

  @ApiProperty({
    type: String,
    example: '2026-10-15',
    description: 'Trade date in YYYY-MM-DD format',
  })
  tradeDate!: string;

  @ApiPropertyOptional({ type: String, example: 'Quantidade correta ajustada' })
  notes?: string;
}

export class RectifyTransactionSwaggerDto {
  @ApiProperty({
    type: String,
    enum: ['RECTIFY', 'CANCEL'],
    example: 'RECTIFY',
    description: 'Whether to rectify with replacement or only reverse/cancel',
  })
  mode!: 'RECTIFY' | 'CANCEL';

  @ApiProperty({
    type: String,
    example: 'Digitação incorreta da quantidade no pregão',
    description: 'Audit justification for the correction (required, max 500 chars)',
  })
  reason!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'rect-vale3-001',
    description: 'Client-provided idempotency key for network retry safety',
  })
  idempotencyKey?: string;

  @ApiPropertyOptional({
    type: RectifyTransactionReplacementSwaggerDto,
    description: 'Replacement transaction parameters (required if mode is RECTIFY)',
  })
  replacement?: RectifyTransactionReplacementSwaggerDto;
}
