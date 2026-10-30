import { z } from 'zod';
import {
  UUIDSchema,
  CurrencySchema,
  LocalDateSchema,
  DecimalStringSchema,
} from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CorporateActionLegSchema = z.object({
  assetId: UUIDSchema,
  type: z.enum(['SPLIT', 'REVERSE_SPLIT']),
  tradeDate: LocalDateSchema,
  factor: DecimalStringSchema,
  notes: z.string().trim().min(1).max(1000),
  externalId: z.string().trim().min(1).max(255).optional(),
});

export const PreviewCorporateActionsBodySchema = z.object({
  accountId: UUIDSchema,
  currency: CurrencySchema,
  legs: z.array(CorporateActionLegSchema).min(1).max(20),
});

export type PreviewCorporateActionsBody = z.infer<typeof PreviewCorporateActionsBodySchema>;

export const ConfirmCorporateActionsBodySchema = PreviewCorporateActionsBodySchema.extend({
  expectedLedgerFingerprint: z.string().trim().min(1).max(128),
});

export type ConfirmCorporateActionsBody = z.infer<typeof ConfirmCorporateActionsBodySchema>;

export class CorporateActionLegSwaggerDto {
  @ApiProperty({ type: String, example: '44444444-4444-4444-8444-444444444444' })
  assetId!: string;

  @ApiProperty({ enum: ['SPLIT', 'REVERSE_SPLIT'], example: 'REVERSE_SPLIT' })
  type!: string;

  @ApiProperty({ type: String, example: '2025-04-15' })
  tradeDate!: string;

  @ApiProperty({ type: String, example: '40', description: 'Strict decimal string, > 0 and != 1' })
  factor!: string;

  @ApiProperty({
    type: String,
    example: 'Telefônica Brasil — grupamento 40:1, efeitos em 15/04/2025.',
  })
  notes!: string;

  @ApiPropertyOptional({ type: String, example: 'MANUAL-CA|REVERSE_SPLIT|...' })
  externalId?: string;
}

export class PreviewCorporateActionsSwaggerDto {
  @ApiProperty({ type: String, example: '22222222-2222-4222-8222-222222222222' })
  accountId!: string;

  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({ type: [CorporateActionLegSwaggerDto] })
  legs!: CorporateActionLegSwaggerDto[];
}

export class ConfirmCorporateActionsSwaggerDto extends PreviewCorporateActionsSwaggerDto {
  @ApiProperty({
    type: String,
    description: 'Ledger fingerprint returned by preview (stale guard)',
  })
  expectedLedgerFingerprint!: string;
}
