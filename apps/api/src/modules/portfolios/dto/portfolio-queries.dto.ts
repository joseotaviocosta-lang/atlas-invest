import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetPortfolioStateQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Inclusive economic cutoff date in YYYY-MM-DD format (civil calendar)',
    example: '2026-09-17',
  })
  asOf?: string;
}

export class GetPortfolioPositionsQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Inclusive economic cutoff date in YYYY-MM-DD format (civil calendar)',
    example: '2026-09-17',
  })
  asOf?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Optional account UUID to filter positions to a single account belonging to the portfolio',
    example: 'd0000000-0000-4000-8000-000000000001',
  })
  accountId?: string;
}

export class GetPortfolioHistoryQueryDto {
  @ApiPropertyOptional({
    type: String,
    enum: ['realized', 'income', 'cash-flow', 'corporate-action', 'transfer'],
    description: 'Filter historical audit events by category',
    example: 'realized',
  })
  type?: 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';

  @ApiPropertyOptional({
    type: String,
    description: 'Start date filter in YYYY-MM-DD format (inclusive)',
    example: '2026-01-01',
  })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'End date filter in YYYY-MM-DD format (inclusive)',
    example: '2026-09-17',
  })
  to?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by account UUID (must belong to portfolio)',
    example: 'd0000000-0000-4000-8000-000000000001',
  })
  accountId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by asset UUID',
    example: 'e0000000-0000-4000-8000-000000000001',
  })
  assetId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Pagination cursor for keyset pagination',
    example: 'rd_f0000000-0000-4000-8000-000000000001',
  })
  cursor?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Maximum number of records to return (1 to 100, default: 20)',
    example: 20,
    default: 20,
  })
  limit?: number;
}
