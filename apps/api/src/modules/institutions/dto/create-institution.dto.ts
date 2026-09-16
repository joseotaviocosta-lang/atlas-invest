import { InstitutionInputSchema, InstitutionInput } from '@atlas/validation';
import { ApiProperty } from '@nestjs/swagger';

export { InstitutionInputSchema };
export type CreateInstitutionDto = InstitutionInput;

export class CreateInstitutionSwaggerDto {
  @ApiProperty({ example: 'XP Investimentos' })
  name!: string;

  @ApiProperty({ enum: ['BANK', 'BROKER', 'CRYPTO_EXCHANGE', 'OTHER'], example: 'BROKER' })
  type!: 'BANK' | 'BROKER' | 'CRYPTO_EXCHANGE' | 'OTHER';

  @ApiProperty({ example: 'BR' })
  country!: string;
}
