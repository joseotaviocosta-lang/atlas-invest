import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MoneySwaggerDto {
  @ApiProperty({ type: String, example: '1000.00', description: 'Exact financial decimal string' })
  amount!: string;

  @ApiProperty({ type: String, example: 'BRL', description: 'ISO 4217 Currency code' })
  currency!: string;
}

export class PortfolioPositionSwaggerDto {
  @ApiProperty({ type: String, example: 'e0000000-0000-4000-8000-000000000001' })
  assetId!: string;

  @ApiProperty({ type: String, example: '100', description: 'Exact share quantity string' })
  quantity!: string;

  @ApiProperty({ enum: ['KNOWN', 'INCOMPLETE'], example: 'KNOWN' })
  costBasisStatus!: 'KNOWN' | 'INCOMPLETE';

  @ApiPropertyOptional({ type: String, example: 'BRL' })
  currency?: string;

  @ApiProperty({ type: MoneySwaggerDto, nullable: true })
  totalCost!: MoneySwaggerDto | null;

  @ApiProperty({ type: MoneySwaggerDto, nullable: true })
  averageCost!: MoneySwaggerDto | null;
}

export class RealizedSummarySwaggerDto {
  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({ enum: ['KNOWN', 'INCOMPLETE'], example: 'KNOWN' })
  status!: 'KNOWN' | 'INCOMPLETE';

  @ApiProperty({ type: MoneySwaggerDto })
  grossProceeds!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  sellingCosts!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  netProceeds!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto, nullable: true })
  costBasisRemoved!: MoneySwaggerDto | null;

  @ApiProperty({ type: MoneySwaggerDto, nullable: true })
  realizedGainLoss!: MoneySwaggerDto | null;

  @ApiProperty({ type: String, nullable: true, example: '15.5' })
  realizedReturnPercentage!: string | null;

  @ApiProperty({ type: Number, example: 3 })
  disposalCount!: number;
}

export class IncomeSummarySwaggerDto {
  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({ type: MoneySwaggerDto })
  totalDividends!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalJcp!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalFiiIncome!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalIncome!: MoneySwaggerDto;
}

export class CashFlowSummarySwaggerDto {
  @ApiProperty({ type: String, example: 'BRL' })
  currency!: string;

  @ApiProperty({ type: MoneySwaggerDto })
  totalInflows!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalOutflows!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  netExternalFlow!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalExternalContributions!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalExternalWithdrawals!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalCapitalReturns!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalFees!: MoneySwaggerDto;

  @ApiProperty({ type: MoneySwaggerDto })
  totalTaxes!: MoneySwaggerDto;
}

export class AccountStateSwaggerDto {
  @ApiProperty({ type: String, example: 'd0000000-0000-4000-8000-000000000001' })
  accountId!: string;

  @ApiProperty({ type: [PortfolioPositionSwaggerDto] })
  positions!: PortfolioPositionSwaggerDto[];

  @ApiProperty({ type: [RealizedSummarySwaggerDto] })
  realizedSummaries!: RealizedSummarySwaggerDto[];

  @ApiProperty({ type: [IncomeSummarySwaggerDto] })
  incomeSummaries!: IncomeSummarySwaggerDto[];

  @ApiProperty({ type: [CashFlowSummarySwaggerDto] })
  cashFlowSummaries!: CashFlowSummarySwaggerDto[];
}

export class ReplayMetadataSwaggerDto {
  @ApiProperty({ type: String, example: '1.0.0-alpha.6' })
  engineVersion!: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-17' })
  asOfDate!: string | null;

  @ApiProperty({ type: Number, example: 45 })
  processedTransactionCount!: number;

  @ApiProperty({ type: Number, example: 45 })
  appliedTransactionCount!: number;

  @ApiProperty({ type: Number, example: 0 })
  deferredTransactionCount!: number;

  @ApiProperty({ type: Boolean, example: false })
  hasIncompleteCostBasis!: boolean;
}

export class PortfolioCompletenessSwaggerDto {
  @ApiProperty({ enum: ['COMPLETE', 'INCOMPLETE'], example: 'COMPLETE' })
  costBasis!: 'COMPLETE' | 'INCOMPLETE';
}

export class PortfolioStateResponseSwaggerDto {
  @ApiProperty({ type: String, example: 'c0000000-0000-4000-8000-000000000001' })
  portfolioId!: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-17' })
  asOfDate!: string | null;

  @ApiProperty({ type: String, example: '1.0.0-alpha.6' })
  engineVersion!: string;

  @ApiProperty({ type: PortfolioCompletenessSwaggerDto })
  completeness!: PortfolioCompletenessSwaggerDto;

  @ApiProperty({ type: [PortfolioPositionSwaggerDto] })
  positions!: PortfolioPositionSwaggerDto[];

  @ApiProperty({ type: [AccountStateSwaggerDto] })
  accounts!: AccountStateSwaggerDto[];

  @ApiProperty({ type: [RealizedSummarySwaggerDto] })
  realizedSummaries!: RealizedSummarySwaggerDto[];

  @ApiProperty({ type: [IncomeSummarySwaggerDto] })
  incomeSummaries!: IncomeSummarySwaggerDto[];

  @ApiProperty({ type: [CashFlowSummarySwaggerDto] })
  cashFlowSummaries!: CashFlowSummarySwaggerDto[];

  @ApiProperty({ type: ReplayMetadataSwaggerDto })
  replayMetadata!: ReplayMetadataSwaggerDto;
}

export class PortfolioPositionsResponseSwaggerDto {
  @ApiProperty({ type: String, example: 'c0000000-0000-4000-8000-000000000001' })
  portfolioId!: string;

  @ApiProperty({ type: String, nullable: true, example: 'd0000000-0000-4000-8000-000000000001' })
  accountId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-17' })
  asOfDate!: string | null;

  @ApiProperty({ type: [PortfolioPositionSwaggerDto] })
  positions!: PortfolioPositionSwaggerDto[];
}

export class PortfolioHistoryItemSwaggerDto {
  @ApiProperty({ type: String, example: 'rd_f0000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({
    enum: ['REALIZED_DISPOSAL', 'INCOME', 'CASH_FLOW', 'CORPORATE_ACTION', 'TRANSFER'],
    example: 'REALIZED_DISPOSAL',
  })
  kind!: string;

  @ApiProperty({ type: String, example: 'f0000000-0000-4000-8000-000000000001' })
  transactionId!: string;

  @ApiProperty({ type: String, example: '2026-09-17' })
  tradeDate!: string;

  @ApiProperty({ type: String, example: 'd0000000-0000-4000-8000-000000000001' })
  accountId!: string;

  @ApiProperty({ type: String, nullable: true, example: 'e0000000-0000-4000-8000-000000000001' })
  assetId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'BRL' })
  currency!: string | null;

  @ApiProperty({ type: Object })
  details!: Record<string, unknown>;
}

export class PortfolioHistoryPaginationMetaSwaggerDto {
  @ApiProperty({ type: Number, example: 20 })
  limit!: number;

  @ApiProperty({ type: String, nullable: true, example: null })
  cursor!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'rd_f0000000-0000-4000-8000-000000000020' })
  nextCursor!: string | null;

  @ApiProperty({ type: Boolean, example: false })
  hasMore!: boolean;

  @ApiProperty({ type: Number, example: 5 })
  totalCount!: number;
}

export class PortfolioHistoryResponseSwaggerDto {
  @ApiProperty({ type: [PortfolioHistoryItemSwaggerDto] })
  items!: PortfolioHistoryItemSwaggerDto[];

  @ApiProperty({ type: PortfolioHistoryPaginationMetaSwaggerDto })
  meta!: PortfolioHistoryPaginationMetaSwaggerDto;
}
