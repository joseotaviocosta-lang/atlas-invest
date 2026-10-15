import { AssetInputSchema, AssetInput } from '@atlas/validation';
import { ASSET_TYPES } from '@atlas/domain';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export { AssetInputSchema };
export type CreateAssetDto = AssetInput;

export class CreateAssetSwaggerDto {
  @ApiProperty({ type: String, example: 'PETR4' })
  ticker!: string;

  @ApiProperty({ type: String, example: 'Petróleo Brasileiro S.A.' })
  name!: string;

  @ApiProperty({ type: String, enum: ASSET_TYPES, example: 'STOCK' })
  type!: (typeof ASSET_TYPES)[number];

  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({ type: String, example: 'BVMF' })
  exchange!: string;

  @ApiPropertyOptional({ type: String, example: 'BRPETRACNPR6' })
  isin?: string;

  @ApiPropertyOptional({ type: String, example: '33.000.167/0001-01' })
  cnpj?: string;

  @ApiPropertyOptional({ type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' })
  status?: 'ACTIVE' | 'ARCHIVED';
}
