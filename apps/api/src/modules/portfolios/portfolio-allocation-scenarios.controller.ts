import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
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
import { PortfolioAllocationScenariosUseCase } from '../../application/portfolios/portfolio-allocation-scenarios.use-case';
import {
  CompareAllocationScenariosBody,
  CompareAllocationScenariosBodySchema,
  CompareAllocationScenariosSwaggerDto,
  SaveAllocationScenarioBody,
  SaveAllocationScenarioBodySchema,
  SaveAllocationScenarioSwaggerDto,
} from './dto/portfolio-allocation-scenarios.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5Q-E — saved hypothetical allocation scenarios (input only).
 *
 * The user saves named hypotheses (manually-split contributions);
 * detail and comparison always recompute live against the current
 * portfolio and strategy. Nothing projected is ever persisted, nothing
 * is executed, no recommendation is produced.
 */
@ApiTags('PortfolioAllocationScenarios')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/allocation-scenarios')
export class PortfolioAllocationScenariosController {
  constructor(
    @Inject(PortfolioAllocationScenariosUseCase)
    private readonly scenarios: PortfolioAllocationScenariosUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Save a hypothetical contribution scenario (input only)',
    description:
      'Persists the user-declared hypothesis (name + per-category amounts). Projected allocation is never stored; it is recomputed live on detail/compare.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({ type: SaveAllocationScenarioSwaggerDto })
  @ApiResponse({ status: 201, description: 'Saved scenario' })
  @ApiResponse({ status: 400, description: 'Invalid name, type, category or amount' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async createScenario(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(SaveAllocationScenarioBodySchema))
    body: SaveAllocationScenarioBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const saved = await this.scenarios.createScenario({
      portfolioId,
      userId: principal.userId,
      name: body.name,
      type: body.type,
      changes: body.changes,
    });
    return { data: { scenario: saved } };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List saved scenarios (light metadata, no simulation)',
    description:
      'Returns saved hypotheses with their hypothetical totals only. No live simulation runs per card.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Saved scenarios' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async listScenarios(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.scenarios.listScenarios(portfolioId, principal.userId);
    return { data: result };
  }

  @Post('compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compare two saved scenarios on the same live basis',
    description:
      'Simulates both hypotheses against one shared current allocation + strategy snapshot and returns factual differences. No choosing, no scoring, no recommendation.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({ type: CompareAllocationScenariosSwaggerDto })
  @ApiResponse({ status: 200, description: 'Factual comparison of both live results' })
  @ApiResponse({
    status: 400,
    description: 'Invalid IDs, same ID twice, or unavailable live basis',
  })
  @ApiResponse({ status: 404, description: 'Portfolio or scenario not found' })
  async compareScenarios(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CompareAllocationScenariosBodySchema))
    body: CompareAllocationScenariosBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.scenarios.compareScenarios({
      portfolioId,
      userId: principal.userId,
      scenarioIds: body.scenarioIds,
    });
    return { data: result };
  }

  @Get(':scenarioId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Open a saved scenario with a live recomputation',
    description:
      'Returns the saved hypothesis plus a simulation recomputed against the current portfolio and strategy. Inputs stay; results never persist.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'scenarioId', description: 'UUID of the saved scenario' })
  @ApiResponse({ status: 200, description: 'Saved scenario with live result' })
  @ApiResponse({ status: 404, description: 'Portfolio or scenario not found' })
  async getScenario(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('scenarioId', UUIDParamPipe) scenarioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.scenarios.getScenarioDetail({
      scenarioId,
      portfolioId,
      userId: principal.userId,
    });
    return { data: result };
  }

  @Put(':scenarioId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace a saved scenario (atomic full replacement)',
    description:
      'Replaces name + changes in a single transaction. Live results recompute on next open.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'scenarioId', description: 'UUID of the saved scenario' })
  @ApiBody({ type: SaveAllocationScenarioSwaggerDto })
  @ApiResponse({ status: 200, description: 'Updated saved scenario' })
  @ApiResponse({ status: 400, description: 'Invalid name, type, category or amount' })
  @ApiResponse({ status: 404, description: 'Portfolio or scenario not found' })
  async updateScenario(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('scenarioId', UUIDParamPipe) scenarioId: string,
    @Body(new ZodValidationPipe(SaveAllocationScenarioBodySchema))
    body: SaveAllocationScenarioBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const saved = await this.scenarios.updateScenario({
      scenarioId,
      portfolioId,
      userId: principal.userId,
      name: body.name,
      type: body.type,
      changes: body.changes,
    });
    return { data: { scenario: saved } };
  }

  @Delete(':scenarioId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a saved scenario',
    description:
      'Removes the saved hypothesis only. Portfolio, strategy, transactions and history are untouched.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiParam({ name: 'scenarioId', description: 'UUID of the saved scenario' })
  @ApiResponse({ status: 200, description: 'Scenario deleted' })
  @ApiResponse({ status: 404, description: 'Portfolio or scenario not found' })
  async deleteScenario(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Param('scenarioId', UUIDParamPipe) scenarioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    await this.scenarios.deleteScenario({ scenarioId, portfolioId, userId: principal.userId });
    return { data: { deleted: true } };
  }
}
