import { Controller, Get, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { GetMonthlyTaxStateUseCase } from '../../application/fiscal/get-monthly-tax-state.use-case';
import { GetMonthlyTaxLiabilityUseCase } from '../../application/fiscal/get-monthly-tax-liability.use-case';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Fiscal')
@ApiBearerAuth()
@Controller('api/v1/fiscal')
export class FiscalController {
  constructor(
    @Inject(GetMonthlyTaxStateUseCase)
    private readonly getMonthlyTaxStateUseCase: GetMonthlyTaxStateUseCase,
    @Inject(GetMonthlyTaxLiabilityUseCase)
    private readonly getMonthlyTaxLiabilityUseCase: GetMonthlyTaxLiabilityUseCase,
  ) {}

  @Get('monthly/:competence')
  @ApiOperation({
    summary:
      'Get the deterministic Monthly Tax State (fiscal events, per-category facts and data quality) for a civil competence. Foundation only — no tax liability is computed.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({ status: 200, description: 'Monthly fiscal state (may be EMPTY/PARTIAL/BLOCKED)' })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getMonthlyTaxState(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getMonthlyTaxStateUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }

  @Get('monthly/:competence/liability')
  @ApiOperation({
    summary:
      'Get the deterministic Monthly Tax Liability and loss compensation for a civil competence. Production tax due is emitted only under an effective VERIFIED rule; otherwise it fails closed.',
  })
  @ApiParam({ name: 'competence', description: 'Civil competence in canonical YYYY-MM format' })
  @ApiResponse({
    status: 200,
    description: 'Monthly tax liability (may be COMPLETE/PARTIAL/BLOCKED/NO_ACTIVITY)',
  })
  @ApiResponse({ status: 400, description: 'Invalid competence' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getMonthlyTaxLiability(
    @Param('competence') competence: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getMonthlyTaxLiabilityUseCase.execute({
      userId: principal.userId,
      competence,
    });
    return { data };
  }
}
