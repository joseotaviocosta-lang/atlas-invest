import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioAuditHistoryUseCase } from '../../application/portfolios/get-portfolio-audit-history.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';
import { GetPortfolioAuditHistoryQueryDto } from './dto/portfolio-queries.dto';

/**
 * Phase 5S-E — operational audit trail and change history controller (read-only).
 *
 * Exposes a portfolio-scoped, deterministically sorted operational audit feed
 * derived from factual, persisted events across transaction rectifications,
 * reconciliation decisions and integration runs.
 */
@ApiTags('PortfolioAuditHistory')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/audit-history')
export class PortfolioAuditHistoryController {
  constructor(
    @Inject(GetPortfolioAuditHistoryUseCase)
    private readonly getAuditHistoryUseCase: GetPortfolioAuditHistoryUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get operational audit trail and change activity history',
    description:
      'Returns a paginated, globally ordered operational audit feed across rectifications, reconciliation decisions and integration runs.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Operational audit history feed' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getAuditHistory(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query() query: GetPortfolioAuditHistoryQueryDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.getAuditHistoryUseCase.execute({
      portfolioId,
      userId: principal.userId,
      category: query.category,
      cursor: query.cursor,
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
    });
    return {
      data: result.items,
      meta: result.meta,
    };
  }
}
