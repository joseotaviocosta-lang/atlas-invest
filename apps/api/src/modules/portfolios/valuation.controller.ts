import { Controller, Get, Post, Body, Param, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import {
  GetPortfolioValuationUseCase,
  GetPortfolioAllocationUseCase,
  UpdatePortfolioMarketDataUseCase,
} from '../../application/valuation';
import { UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

export class UpdateMarketDataDto {
  lookbackDays?: number;
  from?: string;
  to?: string;
  providerOverride?: 'BRAPI' | 'IN_MEMORY';
}

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios')
export class ValuationController {
  constructor(
    @Inject(GetPortfolioValuationUseCase)
    private readonly getPortfolioValuationUseCase: GetPortfolioValuationUseCase,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly getPortfolioAllocationUseCase: GetPortfolioAllocationUseCase,
    @Inject(UpdatePortfolioMarketDataUseCase)
    private readonly updatePortfolioMarketDataUseCase: UpdatePortfolioMarketDataUseCase,
  ) {}

  @Get(':portfolioId/valuation')
  @ApiOperation({ summary: 'Get current portfolio valuation (market value & unrealized P&L)' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Current portfolio valuation' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or unauthorized' })
  @ApiResponse({ status: 422, description: 'Replay failure' })
  async getValuation(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioValuationUseCase.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data };
  }

  @Get(':portfolioId/allocation')
  @ApiOperation({ summary: 'Get current portfolio asset and asset-class allocation breakdown' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Current portfolio allocation' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or unauthorized' })
  @ApiResponse({ status: 422, description: 'Replay failure' })
  async getAllocation(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioAllocationUseCase.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data };
  }

  @Post(':portfolioId/market-data/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update market data for held assets in portfolio (EOD quotes ingestion)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({ required: false, type: UpdateMarketDataDto })
  @ApiResponse({ status: 200, description: 'Ingestion receipt' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or unauthorized' })
  async updateMarketData(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body() body: UpdateMarketDataDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.updatePortfolioMarketDataUseCase.execute({
      portfolioId,
      userId: principal.userId,
      lookbackDays: body?.lookbackDays ? Number(body.lookbackDays) : undefined,
      from: body?.from,
      to: body?.to,
      providerOverride: body?.providerOverride,
    });
    return { data };
  }
}
