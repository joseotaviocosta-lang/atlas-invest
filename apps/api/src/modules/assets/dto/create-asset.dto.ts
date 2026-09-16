import { AssetInputSchema, AssetInput } from '@atlas/validation';
import { ASSET_TYPES } from '@atlas/domain';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export { AssetInputSchema };
export type CreateAssetDto = AssetInput;

export class CreateAssetSwaggerDto {
  @ApiProperty({ example: 'PETR4' })
  ticker!: string;

  @ApiProperty({ example: 'Petróleo Brasileiro S.A.' })
  name!: string;

  @ApiProperty({ enum: ASSET_TYPES, example: 'EQUITY' })
  type!: (typeof ASSET_TYPES)[number];

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiProperty({ example: 'BVMF' })
  exchange!: string;

  @ApiPropertyOptional({ example: 'BRPETRACNPR6' })
  isin?: string;

  @ApiPropertyOptional({ example: '33.000.167/0001-01' })
  cnpj?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' })
  status?: 'ACTIVE' | 'ARCHIVED';
}
