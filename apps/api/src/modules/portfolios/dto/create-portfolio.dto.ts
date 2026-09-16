import { PortfolioInputSchema, PortfolioInput } from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export { PortfolioInputSchema };
export type CreatePortfolioDto = PortfolioInput;

export class CreatePortfolioSwaggerDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  userId!: string;

  @ApiProperty({ example: 'Carteira Principal' })
  name!: string;

  @ApiProperty({ example: 'BRL' })
  baseCurrency!: string;

  @ApiPropertyOptional({ enum: ['PERSONAL', 'FAMILY', 'COMPANY', 'SIMULATION'], default: 'PERSONAL' })
  type?: 'PERSONAL' | 'FAMILY' | 'COMPANY' | 'SIMULATION';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' })
  status?: 'ACTIVE' | 'ARCHIVED';
}
