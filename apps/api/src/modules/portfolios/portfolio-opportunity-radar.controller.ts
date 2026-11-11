import { Controller, Get, Post, Body, HttpCode, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { GetOpportunityRadarUseCase } from '../../application/portfolios/opportunity-radar/get-opportunity-radar.use-case';
import { UUIDParamPipe } from '../../common/pipes';
import { AuthenticatedPrincipal, CurrentPrincipal } from '../../auth';

const MarkPortfolioNewsSeenSchema = z
  .object({
    canonicalEventIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
    markAllNew: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.markAllNew) || (data.canonicalEventIds && data.canonicalEventIds.length > 0), {
    message: 'Provide either markAllNew: true or a non-empty canonicalEventIds array.',
  });

const NewsAlertVersionsSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            canonicalEventId: z.string().trim().min(1).max(120),
            eventVersionFingerprint: z.string().trim().min(1).max(64),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

const NewsAlertAuditItemSchema = z
  .object({
    canonicalEventId: z.string().trim().min(1).max(120),
    eventVersionFingerprint: z.string().trim().min(1).max(64),
    ticker: z.string().trim().min(1).max(32).optional(),
    eventState: z.enum(['NEW', 'UPDATED']).optional(),
    materiality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE']).optional(),
    alertType: z
      .enum([
        'CRITICAL_NEW',
        'CRITICAL_UPDATE',
        'MATERIAL_NEW',
        'MATERIAL_UPDATE',
        'MATERIAL_BATCH_SUMMARY',
      ])
      .optional(),
    headlineSnapshot: z.string().trim().min(1).max(500).optional(),
    materialityReasonSnapshot: z.string().trim().max(500).nullable().optional(),
    sourceLabelSnapshot: z.string().trim().max(120).nullable().optional(),
    claimedAt: z.string().datetime({ offset: true }).nullable().optional(),
    attemptedAt: z.string().datetime({ offset: true }).optional(),
    deliveredAt: z.string().datetime({ offset: true }).nullable().optional(),
    notificationId: z.string().trim().max(120).nullable().optional(),
    batchEventCount: z.number().int().min(1).max(200).optional(),
    batchTickers: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
    alertAttemptId: z.string().uuid().optional(),
    deliveryStatus: z
      .enum(['DELIVERED', 'DELIVERY_FAILED', 'PERMISSION_DENIED', 'UNSUPPORTED', 'UNAVAILABLE'])
      .optional(),
    failureReason: z.string().max(500).nullable().optional(),
  })
  .strict();

const NewsAlertConfirmSchema = z
  .object({
    items: z.array(NewsAlertAuditItemSchema).min(1).max(200),
    alertAttemptId: z.string().uuid().optional(),
    notificationId: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

const NewsAlertReleaseSchema = z
  .object({
    items: z.array(NewsAlertAuditItemSchema).min(1).max(200),
    deliveryStatus: z
      .enum(['DELIVERY_FAILED', 'PERMISSION_DENIED', 'UNSUPPORTED', 'UNAVAILABLE'])
      .optional(),
    failureReason: z.string().max(500).nullable().optional(),
    attemptedAt: z.string().datetime({ offset: true }).optional(),
    alertAttemptId: z.string().uuid().optional(),
    recordHistory: z.boolean().optional(),
  })
  .strict();

function isValidCivilDateOrIso(raw: string): boolean {
  const trimmed = raw.trim();
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() + 1 === m &&
      dt.getUTCDate() === d
    );
  }
  const isoParsed = Date.parse(trimmed);
  return Number.isFinite(isoParsed) && trimmed.includes('T');
}

const NewsAlertHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
    status: z
      .enum(['DELIVERED', 'DELIVERY_FAILED', 'PERMISSION_DENIED', 'UNSUPPORTED', 'UNAVAILABLE'])
      .optional(),
    ticker: z.string().trim().min(1).max(32).optional(),
    materiality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE']).optional(),
    alertType: z
      .enum([
        'CRITICAL_NEW',
        'CRITICAL_UPDATE',
        'MATERIAL_NEW',
        'MATERIAL_UPDATE',
        'MATERIAL_BATCH_SUMMARY',
      ])
      .optional(),
    from: z.string().trim().refine(isValidCivilDateOrIso, {
      message: 'Invalid from date (expected YYYY-MM-DD or ISO-8601 datetime).',
    }).optional(),
    to: z.string().trim().refine(isValidCivilDateOrIso, {
      message: 'Invalid to date (expected YYYY-MM-DD or ISO-8601 datetime).',
    }).optional(),
  })
  .strict();

/**
 * Phase APP-16F / APP-16H / APP-16I — Daily Opportunity Radar (Read-only analysis).
 *
 * Evaluates active portfolio assets to identify top opportunities for analysis.
 * Zero order execution, zero buy buttons, read-only analysis with explainability.
 */
@ApiTags('PortfolioOpportunityRadar')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/opportunity-radar')
export class PortfolioOpportunityRadarController {
  constructor(
    @Inject(GetOpportunityRadarUseCase)
    private readonly radarUseCase: GetOpportunityRadarUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get daily opportunity radar for a portfolio (read-only)',
    description:
      'Returns top assets from the portfolio to study for potential contributions based on price, momentum, portfolio fit, fundamentals, recent news, and dividend calendar. Cached for instant startup.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'strategy', required: false, description: 'Optional strategy toggle: DIVIDEND_CASH_ROTATION (default) or NO_CALENDAR' })
  @ApiResponse({ status: 200, description: 'Opportunity radar result' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getOpportunityRadar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('strategy') strategy?: string,
  ) {
    const enableDividendCalendarStrategy = strategy !== 'NO_CALENDAR' && strategy !== 'false';
    const data = await this.radarUseCase.execute({
      portfolioId,
      userId: principal.userId,
      forceRefresh: false,
      enableDividendCalendarStrategy,
    });
    return { data };
  }

  @Get('news')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get portfolio news inbox (read-only)',
    description:
      'Returns canonical deduplicated news events, novelty state (NEW/UPDATED/SEEN/UNCHANGED), breakdown, and provider status for portfolio assets.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'refresh', required: false, description: 'Pass true to bypass the 20-minute raw feed cache and fetch fresh articles' })
  @ApiResponse({ status: 200, description: 'Portfolio news inbox' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioNews(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('refresh') refresh?: string,
  ) {
    const forceRefresh = refresh === 'true' || refresh === '1';
    const data = await this.radarUseCase.getPortfolioNews({
      portfolioId,
      userId: principal.userId,
      forceRefresh,
    });
    return { data };
  }

  @Post('news/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Explicitly refresh portfolio news intelligence',
    description:
      'Fetches fresh regulatory and financial news events without erasing unseen NEW/UPDATED states.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Refreshed portfolio news inbox with state' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async refreshPortfolioNews(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.radarUseCase.getPortfolioNews({
      portfolioId,
      userId: principal.userId,
      forceRefresh: true,
    });
    return { data };
  }

  @Post('news/seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark portfolio news events as seen',
    description:
      'Explicitly transitions targeted canonicalEventIds or all NEW/UPDATED events in the portfolio to SEEN.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Mark seen result' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async markPortfolioNewsSeen(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    const parsed = MarkPortfolioNewsSeenSchema.parse(body ?? {});
    const data = await this.radarUseCase.markPortfolioNewsSeen({
      portfolioId,
      userId: principal.userId,
      canonicalEventIds: parsed.canonicalEventIds,
      markAllNew: parsed.markAllNew,
    });
    return { data };
  }

  @Post('news/alerts/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically claim un-alerted material news versions prior to local notification delivery',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Claimed alert candidates' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async claimPortfolioNewsAlerts(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    const parsed = NewsAlertVersionsSchema.parse(body ?? {});
    const data = await this.radarUseCase.claimPendingNewsAlerts({
      portfolioId,
      userId: principal.userId,
      items: parsed.items,
    });
    return { data };
  }

  @Post('news/alerts/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm delivered material news alert versions so they will not alert again',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Confirmation result' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async confirmPortfolioNewsAlertsDelivered(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    const parsed = NewsAlertConfirmSchema.parse(body ?? {});
    const data = await this.radarUseCase.confirmNewsAlertsDelivered({
      portfolioId,
      userId: principal.userId,
      items: parsed.items,
      alertAttemptId: parsed.alertAttemptId,
      notificationId: parsed.notificationId,
    });
    return { data };
  }

  @Post('news/alerts/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release in-flight alert claims when local OS notification delivery fails or permission is denied',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Released claims count' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async releasePortfolioNewsAlertsClaim(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    const parsed = NewsAlertReleaseSchema.parse(body ?? {});
    const data = await this.radarUseCase.releaseNewsAlertsClaim({
      portfolioId,
      userId: principal.userId,
      items: parsed.items,
      deliveryStatus: parsed.deliveryStatus,
      failureReason: parsed.failureReason,
      attemptedAt: parsed.attemptedAt,
      alertAttemptId: parsed.alertAttemptId,
      recordHistory: parsed.recordHistory,
    });
    return { data };
  }

  @Get('news/alerts/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List append-only material news alert history and audit attempts for a portfolio (read-only)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Paginated material news alert history' })
  @ApiResponse({ status: 400, description: 'Invalid query filters' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPortfolioNewsAlertHistory(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = NewsAlertHistoryQuerySchema.parse(query ?? {});
    const data = await this.radarUseCase.getPortfolioNewsAlertHistory({
      portfolioId,
      userId: principal.userId,
      limit: parsed.limit,
      cursor: parsed.cursor,
      status: parsed.status,
      ticker: parsed.ticker,
      materiality: parsed.materiality,
      alertType: parsed.alertType,
      from: parsed.from,
      to: parsed.to,
    });
    return { data };
  }

  @Post('news/alerts/suppress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suppress baseline or pre-activation material news versions without marking events SEEN',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Suppressed count' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async suppressPortfolioNewsAlertsBaseline(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ) {
    const parsed = NewsAlertVersionsSchema.parse(body ?? {});
    const data = await this.radarUseCase.suppressNewsAlertsBaseline({
      portfolioId,
      userId: principal.userId,
      items: parsed.items,
    });
    return { data };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually refresh daily opportunity radar for a portfolio',
    description: 'Bypasses the daily cache, recalculates metrics with fresh data, and updates cache.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'strategy', required: false, description: 'Optional strategy toggle: DIVIDEND_CASH_ROTATION (default) or NO_CALENDAR' })
  @ApiResponse({ status: 200, description: 'Refreshed opportunity radar result' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async refreshOpportunityRadar(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('strategy') strategy?: string,
  ) {
    const enableDividendCalendarStrategy = strategy !== 'NO_CALENDAR' && strategy !== 'false';
    const data = await this.radarUseCase.execute({
      portfolioId,
      userId: principal.userId,
      forceRefresh: true,
      enableDividendCalendarStrategy,
    });
    return { data };
  }
}
