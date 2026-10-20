/**
 * Phase 5F (I3) - Operator-only backfill plan/execution API.
 *
 * - `POST /api/v1/admin/ingestion/backfill/plan`: dry-run, persisted-only,
 *   zero provider calls, zero DB writes.
 * - `POST /api/v1/admin/ingestion/backfill/run`: operator-confirmed execution
 *   through the existing JobRunner (advisory lock + history + bounded retry).
 *   Only explicit operator execution may call external providers.
 *
 * Same 401/403/200 matrix as the 5E admin surface; `Cache-Control:
 * private, no-store` on all responses.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IngestionOperatorGuard } from '../admin/ingestion-operator.guard';
import { BackfillCoveragePlanner } from './coverage-planner';
import { BackfillOrchestrator } from './backfill-orchestrator';
import {
  BackfillPlanBodyDto,
  BackfillPlanBodySchema,
  BackfillRunBodyDto,
  BackfillRunBodySchema,
} from './backfill-admin.dto';

@ApiTags('Admin - Ingestion Backfill')
@ApiBearerAuth()
@UseGuards(IngestionOperatorGuard)
@Controller('api/v1/admin/ingestion/backfill')
export class BackfillAdminController {
  constructor(
    @Inject(BackfillCoveragePlanner)
    private readonly planner: BackfillCoveragePlanner,
    @Inject(BackfillOrchestrator)
    private readonly orchestrator: BackfillOrchestrator,
  ) {}

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Dry-run backfill plan (persisted coverage only, no provider calls)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { domain: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Backfill plan' })
  @ApiResponse({ status: 400, description: 'Invalid domain/range' })
  async plan(@Body(new ZodValidationPipe(BackfillPlanBodySchema)) body: BackfillPlanBodyDto) {
    try {
      const plan = await this.planner.plan({ domain: body.domain, from: body.from, to: body.to });
      return { data: plan };
    } catch (error) {
      throw new BadRequestException({
        message: error instanceof Error ? error.message : 'Invalid backfill plan request.',
        code: 'BACKFILL.INVALID_RANGE',
      });
    }
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Execute operator-confirmed backfill (may call providers)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        confirmLargeBackfill: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Backfill execution receipt' })
  @ApiResponse({ status: 400, description: 'Invalid domain/range or missing confirmation' })
  async run(@Body(new ZodValidationPipe(BackfillRunBodySchema)) body: BackfillRunBodyDto) {
    try {
      const receipt = await this.orchestrator.execute({
        domain: body.domain,
        from: body.from,
        to: body.to,
        confirmLargeBackfill: body.confirmLargeBackfill,
      });
      return { data: receipt };
    } catch (error) {
      throw new BadRequestException({
        message: error instanceof Error ? error.message : 'Invalid backfill run request.',
        code: 'BACKFILL.INVALID_RANGE',
      });
    }
  }
}
