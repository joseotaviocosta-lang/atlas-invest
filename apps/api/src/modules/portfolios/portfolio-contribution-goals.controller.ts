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
import { PortfolioContributionGoalsUseCase } from '../../application/portfolios/portfolio-contribution-goals.use-case';
import {
  PutContributionGoalBody,
  PutContributionGoalBodySchema,
  PutContributionGoalSwaggerDto,
} from './dto/portfolio-contribution-goals.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5Q-J — user-defined monthly contribution goals (read-only analytics
 * downstream). The goal amount and effective month are always user-declared;
 * the Atlas never suggests a value. PUT semantics: current-or-future
 * effective month; history is preserved by closing the open version, never
 * rewritten. DELETE ends the current goal (or drops a never-effective
 * scheduled one).
 */
@ApiTags('PortfolioContributionGoals')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/contribution-goal')
export class PortfolioContributionGoalsController {
  constructor(
    @Inject(PortfolioContributionGoalsUseCase)
    private readonly goals: PortfolioContributionGoalsUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read the current contribution goal and its history',
    description:
      'Returns the goal in force (if any), a scheduled future version (if any), and closed history newest-first. Read-only.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Current goal, upcoming change and history' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getGoal(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.goals.getGoal({ portfolioId, userId: principal.userId });
    return { data: result };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Declare or change the monthly contribution goal',
    description:
      'User-declared amount + effective month (current or future). Past months are never rewritten: the open version closes and a new one opens.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({ type: PutContributionGoalSwaggerDto })
  @ApiResponse({ status: 200, description: 'Stored goal version' })
  @ApiResponse({
    status: 400,
    description: 'Invalid amount, month, currency or concurrency conflict',
  })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async putGoal(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(PutContributionGoalBodySchema)) body: PutContributionGoalBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.goals.putGoal({
      portfolioId,
      userId: principal.userId,
      amount: body.amount,
      effectiveMonth: body.effectiveMonth,
    });
    return { data: result };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the current contribution goal',
    description:
      'Closes the open version at the current month (history preserved). A never-effective scheduled version is removed.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Goal ended' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or no goal to end' })
  async deleteGoal(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.goals.endGoal({ portfolioId, userId: principal.userId });
    return { data: result };
  }
}
