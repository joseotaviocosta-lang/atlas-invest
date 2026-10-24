import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetPortfolioAllocationStrategyUseCase } from '../../application/portfolios/get-portfolio-allocation-strategy.use-case';
import {
  PutAllocationStrategyBody,
  PutAllocationStrategyBodySchema,
  PutAllocationStrategySwaggerDto,
} from './dto/portfolio-allocation-strategy.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

function toComparisonResponse(
  comparison: Awaited<ReturnType<GetPortfolioAllocationStrategyUseCase['compareStrategy']>>,
) {
  if (!comparison) return null;
  return {
    rows: comparison.rows,
    outsideTolerance: comparison.outsideTolerance,
    worstGap: comparison.worstGap,
    coveragePercent: comparison.coveragePercent,
    qualified: comparison.qualified,
    denominator: comparison.denominator,
    asOf: comparison.asOf,
  };
}

/**
 * Phase 5Q-C — user-defined allocation strategy (intent only).
 *
 * The user declares target weights per asset class; the API compares them
 * against the canonical allocation read model. No trade suggestions, no
 * automatic adjustments, no orders: comparison only.
 */
@ApiTags('PortfolioAllocationStrategy')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/allocation-strategy')
export class PortfolioAllocationStrategyController {
  constructor(
    @Inject(GetPortfolioAllocationStrategyUseCase)
    private readonly strategies: GetPortfolioAllocationStrategyUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the declared allocation strategy and its comparison',
    description:
      'Returns the stored targets (or null when the user never declared one) plus the comparison of current allocation vs targets. Multi-currency portfolios without translated totals and low-coverage portfolios yield UNAVAILABLE comparisons instead of misleading numbers.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Strategy and comparison, or null strategy' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getStrategy(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const [strategy, comparison] = await Promise.all([
      this.strategies.getStrategy(portfolioId, principal.userId),
      this.strategies.compareStrategy(portfolioId, principal.userId),
    ]);
    return {
      data: {
        strategy: strategy
          ? {
              portfolioId: strategy.portfolioId,
              targets: strategy.targets,
              updatedAt: strategy.updatedAt,
            }
          : null,
        comparison: toComparisonResponse(comparison),
      },
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Declare or replace the allocation strategy (whole replacement)',
    description:
      'Replaces the whole target set atomically; targets must total exactly 10000 basis points (100%). Unknown categories, duplicates and non-integer weights are rejected with 400.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({ type: PutAllocationStrategySwaggerDto })
  @ApiResponse({ status: 200, description: 'Stored strategy and fresh comparison' })
  @ApiResponse({ status: 400, description: 'Invalid total, category, weight or shape' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async putStrategy(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(PutAllocationStrategyBodySchema)) body: PutAllocationStrategyBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const strategy = await this.strategies.replaceStrategy({
      portfolioId,
      userId: principal.userId,
      targets: body.targets,
    });
    const comparison = await this.strategies.compareStrategy(portfolioId, principal.userId);
    return {
      data: {
        strategy: {
          portfolioId: strategy.portfolioId,
          targets: strategy.targets,
          updatedAt: strategy.updatedAt,
        },
        comparison: toComparisonResponse(comparison),
      },
    };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear the declared allocation strategy',
    description:
      'Removes the user-declared targets. Portfolio, transactions, allocation and review history are untouched — only the intent is cleared.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Strategy cleared' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async clearStrategy(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    await this.strategies.clearStrategy(portfolioId, principal.userId);
    return { data: { cleared: true } };
  }
}
