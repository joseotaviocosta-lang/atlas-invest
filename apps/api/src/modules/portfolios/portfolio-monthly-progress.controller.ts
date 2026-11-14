import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetOpportunityRadarUseCase } from '../../application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';
import {
  MonthlyProgressQuerySchema,
} from './dto/portfolio-monthly-progress.dto';

@ApiTags('PortfolioMonthlyProgress')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/monthly-progress')
export class PortfolioMonthlyProgressController {
  constructor(
    @Inject(GetOpportunityRadarUseCase)
    private readonly radarUseCase: GetOpportunityRadarUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get monthly portfolio progress and goal history (read-only timeline)',
    description:
      'Returns a multi-month timeline comparing active contribution goals, created/completed plans, and ledger purchase activity. Strictly separates confirmed plan contributions from general ledger BUY transactions. Historical valuation is marked UNAVAILABLE (no false historical equity). Read-only, zero orders.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start month in YYYY-MM format (inclusive)',
    example: '2025-12',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End month in YYYY-MM format (inclusive)',
    example: '2026-11',
  })
  @ApiResponse({ status: 200, description: 'Monthly portfolio progress and goal history' })
  @ApiResponse({ status: 400, description: 'Invalid range or date format' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getMonthlyProgress(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() rawQuery: Record<string, unknown>,
  ) {
    const query = MonthlyProgressQuerySchema.parse(rawQuery);
    const data = await this.radarUseCase.getMonthlyPortfolioProgress({
      portfolioId,
      userId: principal.userId,
      from: query.from,
      to: query.to,
    });
    return { data };
  }
}
