import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetPortfolioIncomeUseCase } from '../../application/portfolios/get-portfolio-income.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-D — portfolio income intelligence (read-only).
 *
 * Historical income actually recorded in the canonical ledger, grouped
 * per currency and month, with factual by-position ranking and neutral
 * concentration facts. Derived only — persists nothing, projects nothing.
 */
@ApiTags('PortfolioIncome')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/income-intelligence')
export class PortfolioIncomeController {
  constructor(
    @Inject(GetPortfolioIncomeUseCase)
    private readonly income: GetPortfolioIncomeUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read portfolio income intelligence (read-only)',
    description:
      'Per-currency income totals, monthly buckets, by-position ranking and concentration facts from canonical income events. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Period start YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Period end YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Portfolio income intelligence' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioIncome(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.income.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data: result };
  }
}
