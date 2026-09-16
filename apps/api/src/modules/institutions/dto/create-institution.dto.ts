import { InstitutionInputSchema, InstitutionInput } from '@atlas/validation';
import { ApiProperty } from '@nestjs/swagger';

export { InstitutionInputSchema };
export type CreateInstitutionDto = InstitutionInput;

export class CreateInstitutionSwaggerDto {
  @ApiProperty({ type: String, example: 'XP Investimentos' })
  name!: string;

  @ApiProperty({
    type: String,
    enum: ['BANK', 'BROKER', 'CRYPTO_EXCHANGE', 'OTHER'],
    example: 'BROKER',
  })
  type!: 'BANK' | 'BROKER' | 'CRYPTO_EXCHANGE' | 'OTHER';

  @ApiProperty({ type: String, example: 'BR' })
  country!: string;
}
