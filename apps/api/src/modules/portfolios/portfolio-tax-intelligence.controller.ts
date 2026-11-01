import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GetTaxIntelligenceUseCase } from '../../application/tax-intelligence';
import {
  TaxIntelligenceQuerySchema,
  type TaxIntelligenceQuery,
} from './dto/tax-intelligence.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/tax-intelligence')
export class PortfolioTaxIntelligenceController {
  constructor(
    @Inject(GetTaxIntelligenceUseCase)
    private readonly taxIntelligenceUseCase: GetTaxIntelligenceUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Deterministic contextual tax explanation (read-only)',
    description:
      'Projects canonical fiscal/readiness/cost state into a structured explanation. Never recalculates tax, never writes, never calls AI providers.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiResponse({ status: 200, description: 'Structured tax-intelligence response' })
  @ApiResponse({ status: 400, description: 'Invalid competence format' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or unauthorized' })
  async explain(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query(new ZodValidationPipe(TaxIntelligenceQuerySchema)) query: TaxIntelligenceQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.taxIntelligenceUseCase.execute({
      portfolioId,
      userId: principal.userId,
      competence: query.competence,
    });
    return { data };
  }
}
