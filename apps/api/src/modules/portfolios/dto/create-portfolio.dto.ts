import { PortfolioInputSchema, PortfolioInput } from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export { PortfolioInputSchema };
export type CreatePortfolioDto = PortfolioInput;

export class CreatePortfolioSwaggerDto {
  @ApiProperty({ type: String, example: '11111111-1111-4111-8111-111111111111' })
  userId!: string;

  @ApiProperty({ type: String, example: 'Carteira Principal' })
  name!: string;

  @ApiProperty({ type: String, example: 'BRL' })
  baseCurrency!: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['PERSONAL', 'FAMILY', 'COMPANY', 'SIMULATION'],
    default: 'PERSONAL',
  })
  type?: 'PERSONAL' | 'FAMILY' | 'COMPANY' | 'SIMULATION';

  @ApiPropertyOptional({ type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' })
  status?: 'ACTIVE' | 'ARCHIVED';
}
