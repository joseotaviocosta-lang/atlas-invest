import { z } from 'zod';
import {
  UUIDSchema,
  CurrencySchema,
  LocalDateSchema,
  DecimalStringSchema,
  TransactionTypeSchema,
  TransactionSourceSchema,
} from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CreateTransactionBodySchema = z.object({
  id: UUIDSchema.optional(),
  accountId: UUIDSchema,
  type: TransactionTypeSchema,
  currency: CurrencySchema,
  tradeDate: LocalDateSchema,
  settlementDate: LocalDateSchema.optional(),
  source: TransactionSourceSchema.optional(),
  provider: z.string().optional(),
  externalId: z.string().optional(),
  notes: z.string().optional(),
  assetId: UUIDSchema.optional(),
  targetAssetId: UUIDSchema.optional(),
  quantity: DecimalStringSchema.optional(),
  targetQuantity: DecimalStringSchema.optional(),
  conversionRatio: DecimalStringSchema.optional(),
  conversionType: z.string().optional(),
  unitPrice: DecimalStringSchema.optional(),
  fees: DecimalStringSchema.optional(),
  taxes: DecimalStringSchema.optional(),
  amount: DecimalStringSchema.optional(),
  factor: DecimalStringSchema.optional(),
});

export type CreateTransactionBody = z.infer<typeof CreateTransactionBodySchema>;

export class CreateTransactionSwaggerDto {
  @ApiPropertyOptional({ type: String, example: '33333333-3333-4333-8333-333333333333' })
  id?: string;

  @ApiProperty({ type: String, example: '22222222-2222-4222-8222-222222222222' })
  accountId!: string;

  @ApiProperty({
    type: String,
    enum: [
      'BUY',
      'SELL',
      'DIVIDEND',
      'JCP',
      'FII_INCOME',
      'SPLIT',
      'REVERSE_SPLIT',
      'BONUS',
      'SUBSCRIPTION',
      'AMORTIZATION',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'RECEIPT_CONVERSION',
      'DEPOSIT',
      'WITHDRAWAL',
      'FEE',
      'TAX',
    ],
    example: 'BUY',
  })
  type!: string;

  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({
    type: String,
    example: '2026-03-15',
    description: 'Trade date in YYYY-MM-DD format',
  })
  tradeDate!: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-03-17',
    description: 'Settlement date in YYYY-MM-DD format',
  })
  settlementDate?: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['MANUAL', 'B3', 'OPEN_FINANCE', 'BROKER_NOTE', 'IMPORT'],
    default: 'MANUAL',
  })
  source?: string;

  @ApiPropertyOptional({ type: String, example: 'XP' })
  provider?: string;

  @ApiPropertyOptional({ type: String, example: 'ORD-987654' })
  externalId?: string;

  @ApiPropertyOptional({ type: String, example: 'Compra de oportunidade' })
  notes?: string;

  @ApiPropertyOptional({ type: String, example: '44444444-4444-4444-8444-444444444444' })
  assetId?: string;

  @ApiPropertyOptional({ type: String, example: '55555555-5555-4555-8555-555555555555' })
  targetAssetId?: string;

  @ApiPropertyOptional({
    type: String,
    example: '100',
    description: 'Strict decimal string for quantity',
  })
  quantity?: string;

  @ApiPropertyOptional({
    type: String,
    example: '38.50',
    description: 'Strict decimal string for unit price',
  })
  unitPrice?: string;

  @ApiPropertyOptional({
    type: String,
    example: '4.90',
    description: 'Strict decimal string for fees',
  })
  fees?: string;

  @ApiPropertyOptional({
    type: String,
    example: '0.00',
    description: 'Strict decimal string for taxes',
  })
  taxes?: string;

  @ApiPropertyOptional({
    type: String,
    example: '3850.00',
    description: 'Strict decimal string for cash movements/income',
  })
  amount?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2.00',
    description: 'Strict decimal string for split factor',
  })
  factor?: string;

  @ApiPropertyOptional({
    type: String,
    example: '200',
    description: 'Strict decimal string for receipt-conversion target quantity',
  })
  targetQuantity?: string;

  @ApiPropertyOptional({
    type: String,
    example: '1',
    description: 'Strict decimal string for receipt-conversion ratio',
  })
  conversionRatio?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'SUBSCRIPTION_RECEIPT',
    description: 'Receipt-conversion kind',
  })
  conversionType?: string;
}
