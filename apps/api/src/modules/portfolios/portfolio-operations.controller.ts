import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioOperationsUseCase } from '../../application/portfolios/get-portfolio-operations.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5S-A — portfolio operations center (read-only).
 *
 * Aggregates integration state, run history, review items,
 * reconciliation and data quality into one operational view with
 * navigation actions. Derived facts only.
 */
@ApiTags('PortfolioOperations')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/operations-center')
export class PortfolioOperationsController {
  constructor(
    @Inject(GetPortfolioOperationsUseCase)
    private readonly operations: GetPortfolioOperationsUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read portfolio operations center (read-only)',
    description:
      'Operational status, attention items, integrations, reconciliation, data-quality summary and recent activity. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio operations center' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioOperations(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.operations.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }
}
