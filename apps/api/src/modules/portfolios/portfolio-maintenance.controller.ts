import { Controller, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetPortfolioMaintenanceUseCase } from '../../application/portfolios/get-portfolio-maintenance.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5S-D — portfolio data maintenance workspace (read-only).
 *
 * Diagnose → explain → safe human maintenance → recompute. Every
 * 5R-E issue classified as actionable, navigable, unsupported or
 * structural, pointing only at writers and routes that already
 * exist. Derived only — persists nothing.
 */
@ApiTags('PortfolioMaintenance')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/maintenance')
export class PortfolioMaintenanceController {
  constructor(
    @Inject(GetPortfolioMaintenanceUseCase)
    private readonly maintenance: GetPortfolioMaintenanceUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read portfolio data maintenance workspace (read-only)',
    description:
      'Actionable, navigable, unsupported and structural maintenance items derived from data-quality diagnostics. GET never writes.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio maintenance workspace' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioMaintenance(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.maintenance.execute({
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }
}
