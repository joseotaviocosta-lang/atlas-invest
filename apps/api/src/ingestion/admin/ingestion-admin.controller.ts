/**
 * Phase 5E (R3-C/H1) - Privileged ingestion administration API.
 *
 * Every route requires an authenticated operator (server-side allowlist) and
 * delegates to the same IngestionJobService used by the scheduler. Ordinary
 * authenticated users receive 403; unauthenticated requests receive 401.
 *
 * Manual body `scheduledFor` is the execution civil date (YYYY-MM-DD, never a
 * period). The service derives the canonical `targetPeriod` (DAY YYYY-MM-DD,
 * MONTH YYYY-MM, YEAR YYYY) from the job type. Receipts expose both.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LocalDate } from '@atlas/domain';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IngestionJobService } from '../ingestion-job.service';
import { assertValidJobType, IngestionJobType } from '../job-types';
import { civilDateInSaoPaulo } from '../scheduler/ingestion-scheduler';
import { IngestionOperatorGuard } from './ingestion-operator.guard';
import {
  IngestionJobIdParamSchema,
  ListIngestionJobsQuerySchema,
  ListIngestionJobsQueryDto,
  RunIngestionJobBodySchema,
  RunIngestionJobBodyDto,
} from './ingestion-admin.dto';

function resolveManualCivilDate(input: string | undefined): string {
  const civilDate = input ?? civilDateInSaoPaulo();

  let parsed: LocalDate;
  try {
    parsed = LocalDate.from(civilDate);
  } catch {
    throw new BadRequestException({
      message: `Invalid scheduledFor '${civilDate}'. Expected a real civil date YYYY-MM-DD.`,
      code: 'INGESTION.INVALID_SCHEDULED_FOR',
    });
  }

  const today = LocalDate.from(civilDateInSaoPaulo());
  if (parsed.compare(today) > 0) {
    throw new BadRequestException({
      message: `scheduledFor '${civilDate}' cannot be in the future.`,
      code: 'INGESTION.FUTURE_SCHEDULED_FOR',
    });
  }

  return civilDate;
}

@ApiTags('Admin - Ingestion')
@ApiBearerAuth()
@UseGuards(IngestionOperatorGuard)
@Controller('api/v1/admin/ingestion/jobs')
export class IngestionAdminController {
  constructor(
    @Inject(IngestionJobService)
    private readonly jobs: IngestionJobService,
  ) {}

  @Post(':jobType/run')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Manually trigger an allowlisted ingestion job' })
  @ApiParam({ name: 'jobType', description: 'Canonical ingestion job type' })
  @ApiBody({ schema: { type: 'object', properties: { scheduledFor: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Job receipt' })
  @ApiResponse({ status: 400, description: 'Invalid job type/date or forbidden input field' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Authenticated but not an operator' })
  async run(
    @Param('jobType') jobTypeParam: string,
    @Body(new ZodValidationPipe(RunIngestionJobBodySchema)) body: RunIngestionJobBodyDto,
  ) {
    let jobType: IngestionJobType;
    try {
      jobType = assertValidJobType(jobTypeParam.trim().toUpperCase());
    } catch {
      throw new BadRequestException({
        message: `Unsupported ingestion job type '${jobTypeParam}'.`,
        code: 'INGESTION.INVALID_JOB_TYPE',
      });
    }

    const scheduledFor = resolveManualCivilDate(body.scheduledFor);
    const receipt = await this.jobs.run(jobType, 'MANUAL', scheduledFor);
    return { data: receipt };
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List ingestion job runs' })
  @ApiResponse({ status: 200, description: 'Job run history page' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Authenticated but not an operator' })
  async list(
    @Query(new ZodValidationPipe(ListIngestionJobsQuerySchema)) query: ListIngestionJobsQueryDto,
  ) {
    const limit = query.limit ?? 50;
    const result = await this.jobs.listRuns({
      jobType: query.jobType,
      triggerType: query.triggerType,
      status: query.status,
      from: query.from,
      to: query.to,
      limit,
      cursor: query.cursor,
    });
    return {
      data: result.items,
      meta: {
        limit,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    };
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get one ingestion job run by id' })
  @ApiParam({ name: 'id', description: 'Job run UUID' })
  @ApiResponse({ status: 200, description: 'Job receipt' })
  @ApiResponse({ status: 404, description: 'Job run not found' })
  async findOne(@Param('id', new ZodValidationPipe(IngestionJobIdParamSchema)) id: string) {
    const receipt = await this.jobs.findById(id);
    if (!receipt) {
      throw new NotFoundException({
        message: `Ingestion job run '${id}' was not found.`,
        code: 'INGESTION.JOB_NOT_FOUND',
      });
    }
    return { data: receipt };
  }
}
