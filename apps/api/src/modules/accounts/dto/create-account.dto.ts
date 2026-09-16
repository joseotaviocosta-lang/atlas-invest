import { z } from 'zod';
import { UUIDSchema, CurrencySchema, AccountStatusSchema } from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CreateAccountBodySchema = z.object({
  institutionId: UUIDSchema,
  name: z.string().min(1, 'Name cannot be empty'),
  currency: CurrencySchema,
  status: AccountStatusSchema.optional(),
});

export type CreateAccountBody = z.infer<typeof CreateAccountBodySchema>;

export class CreateAccountSwaggerDto {
  @ApiProperty({ example: '22222222-2222-4222-8222-222222222222' })
  institutionId!: string;

  @ApiProperty({ example: 'Conta Investimento Principal' })
  name!: string;

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' })
  status?: 'ACTIVE' | 'ARCHIVED';
}
