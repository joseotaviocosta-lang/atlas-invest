import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetPositionIncomeUseCase } from '../../application/performance/get-position-income.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5R-D — position income intelligence (read-only).
 *
 * Historical income for one open position over its current holding
 * lifecycle: totals by type and currency, monthly timeline, recent
 * events and the share of known portfolio income. Facts only — no
 * events and the share of known portfolio income. Facts only — nothing
 * projected, nothing recommended. Lazy endpoint: the timeline can grow.
 */
@ApiTags('PositionIncome')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/positions/:assetId/income')
export class PositionIncomeController {
  constructor(
    @Inject(GetPositionIncomeUseCase)
    private readonly income: GetPositionIncomeUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read position income intelligence (read-only)',
    description:
      'Canonical DIVIDEND/JCP/FII income for one open position: totals, monthly timeline, recent events and portfolio share. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Period start YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Period end YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Position income intelligence' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio, asset or position not found' })
  async getPositionIncome(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('assetId', UUIDParamPipe) assetId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.income.execute({
      portfolioId,
      assetId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data: result };
  }
}
