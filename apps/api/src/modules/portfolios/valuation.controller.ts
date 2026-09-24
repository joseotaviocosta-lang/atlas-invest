import { Controller, Get, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { GetPortfolioValuationUseCase } from '../../application/valuation';
import { UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios')
export class ValuationController {
  constructor(
    @Inject(GetPortfolioValuationUseCase)
    private readonly getPortfolioValuationUseCase: GetPortfolioValuationUseCase,
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
}
