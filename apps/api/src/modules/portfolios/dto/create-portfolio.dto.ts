import { CreatePortfolioInputSchema, CreatePortfolioInput } from '@atlas/validation';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export { CreatePortfolioInputSchema };
export type CreatePortfolioDto = CreatePortfolioInput;

export class CreatePortfolioSwaggerDto {
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
}
