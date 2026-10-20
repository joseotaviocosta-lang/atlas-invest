/**
 * Phase 5G - Operator-only operations status API (persisted-only reads).
 *
 * - GET /api/v1/admin/operations/data-status  (detects + persists alerts)
 * - GET /api/v1/admin/operations/jobs/health  (pure read)
 * - GET /api/v1/admin/operations/alerts       (pure read)
 * - GET /api/v1/admin/operations/alerts/:id   (pure read)
 * - GET /api/v1/admin/operations/metrics      (pure read)
 * - GET /api/v1/admin/operations/scheduler/readiness (checks only)
 *
 * 401 unauthenticated, 403 ordinary user, 200 operator.
 * Zero upstream provider calls on every route. No auto-repair triggers.
 */

import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IngestionOperatorGuard } from '../admin/ingestion-operator.guard';
import { OperationalAlertRepository } from './operational-alerts';
import { OperationsSummaryService } from './operations-summary.service';
import { SchedulerReadinessService } from './scheduler-readiness.service';
import {
  OperationsAlertIdParamSchema,
  OperationsAlertsQueryDto,
  OperationsAlertsQuerySchema,
} from './operations-admin.dto';

@ApiTags('Admin - Operations')
@ApiBearerAuth()
@UseGuards(IngestionOperatorGuard)
@Controller('api/v1/admin/operations')
export class OperationsAdminController {
  constructor(
    @Inject(OperationsSummaryService)
    private readonly summary: OperationsSummaryService,
    @Inject(SchedulerReadinessService)
    private readonly readiness: SchedulerReadinessService,
    @Inject(OperationalAlertRepository)
    private readonly alerts: OperationalAlertRepository,
  ) {}

  @Get('data-status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Operator operations data status (persisted-only)' })
  @ApiResponse({ status: 200, description: 'Operations status' })
  async dataStatus() {
    return { data: await this.summary.getDataStatus() };
  }

  @Get('jobs/health')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Ingestion job health (persisted-only)' })
  @ApiResponse({ status: 200, description: 'Job health' })
  async jobsHealth() {
    return { data: await this.summary.getJobsHealth() };
  }

  @Get('alerts')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List operational alerts (persisted-only)' })
  @ApiResponse({ status: 200, description: 'Alert history page' })
  async listAlerts(
    @Query(new ZodValidationPipe(OperationsAlertsQuerySchema)) query: OperationsAlertsQueryDto,
  ) {
    const items = await this.alerts.listHistory(query.limit ?? 50, query.status);
    return { data: items, meta: { limit: query.limit ?? 50 } };
  }

  @Get('alerts/:id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get one operational alert (persisted-only)' })
  @ApiResponse({ status: 200, description: 'Alert detail' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async getAlertById(@Param('id', new ZodValidationPipe(OperationsAlertIdParamSchema)) id: string) {
    const row = await this.alerts.findById(id);
    if (!row) {
      throw new NotFoundException({ message: `Operational alert '${id}' was not found.`, code: 'OPERATIONS.ALERT_NOT_FOUND' });
    }
    return { data: row };
  }

  @Get('metrics')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Operational metrics derived from job history (persisted-only)' })
  @ApiResponse({ status: 200, description: 'Metrics' })
  async metrics() {
    return { data: await this.summary.getMetrics() };
  }

  @Get('scheduler/readiness')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Scheduler readiness gate (checks only, never starts jobs)' })
  @ApiResponse({ status: 200, description: 'Readiness verdict' })
  async schedulerReadiness() {
    return { data: await this.readiness.check() };
  }
}
