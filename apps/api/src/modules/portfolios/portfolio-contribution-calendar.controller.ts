import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortfolioContributionCalendarUseCase } from '../../application/portfolios/portfolio-contribution-calendar.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

/**
 * Phase 5Q-K — contribution planning calendar (read-only temporal view).
 *
 * Composes the user-defined goal, plans and CONFIRMED ledger actuals into
 * calendar months. Organizes existing facts only: creates no plans, no
 * goals, no links, no transactions. Bounded window (max 24 months).
 */
@ApiTags('PortfolioContributionCalendar')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/contribution-calendar')
export class PortfolioContributionCalendarController {
  constructor(
    @Inject(PortfolioContributionCalendarUseCase)
    private readonly calendar: PortfolioContributionCalendarUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Read the contribution planning calendar (read-only)',
    description:
      'Month-by-month goal, planned and confirmed amounts with plan and actual rows. Derived only — persists nothing.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'from', required: false, description: 'First month YYYY-MM' })
  @ApiQuery({ name: 'to', required: false, description: 'Last month YYYY-MM' })
  @ApiResponse({ status: 200, description: 'Contribution planning calendar' })
  @ApiResponse({ status: 400, description: 'Invalid range' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getCalendar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.calendar.getCalendar({
      portfolioId,
      userId: principal.userId,
      from,
      to,
    });
    return { data: result };
  }
}
