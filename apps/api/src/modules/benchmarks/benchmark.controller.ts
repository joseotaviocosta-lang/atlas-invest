import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import {
  UpdateBenchmarkDataUseCase,
  GetBenchmarkCoverageUseCase,
} from '../../application/benchmark';

export class UpdateBenchmarkDataDto {
  from!: string;
  to!: string;
  providerOverride?: 'STOOQ' | 'YAHOO' | 'BCB' | 'IN_MEMORY';
}

@ApiTags('Benchmarks')
@ApiBearerAuth()
@Controller('api/v1/benchmarks')
export class BenchmarkController {
  constructor(
    @Inject(UpdateBenchmarkDataUseCase)
    private readonly updateBenchmarkDataUseCase: UpdateBenchmarkDataUseCase,
    @Inject(GetBenchmarkCoverageUseCase)
    private readonly getBenchmarkCoverageUseCase: GetBenchmarkCoverageUseCase,
  ) {}

  @Get(':benchmarkId/coverage')
  @ApiOperation({
    summary: 'Get persisted observation coverage for a canonical benchmark (IBOV, CDI)',
  })
  @ApiParam({ name: 'benchmarkId', description: 'Canonical benchmark ID (IBOV, CDI)' })
  @ApiQuery({ name: 'from', required: false, description: 'Optional start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'Optional end date YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Benchmark coverage details' })
  @ApiResponse({ status: 400, description: 'Unsupported benchmark or invalid dates' })
  async getCoverage(
    @Param('benchmarkId') benchmarkId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.getBenchmarkCoverageUseCase.execute({
      benchmarkId: benchmarkId.trim().toUpperCase(),
      from,
      to,
    });
    return { data };
  }

  @Post(':benchmarkId/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update/backfill persisted observations for a canonical benchmark (IBOV, CDI)',
  })
  @ApiParam({ name: 'benchmarkId', description: 'Canonical benchmark ID (IBOV, CDI)' })
  @ApiBody({ type: UpdateBenchmarkDataDto })
  @ApiResponse({ status: 200, description: 'Benchmark ingestion receipt' })
  @ApiResponse({ status: 400, description: 'Unsupported benchmark or invalid dates' })
  async updateBenchmark(
    @Param('benchmarkId') benchmarkId: string,
    @Body() body: UpdateBenchmarkDataDto,
  ) {
    const data = await this.updateBenchmarkDataUseCase.execute({
      benchmarkId: benchmarkId.trim().toUpperCase(),
      from: body.from,
      to: body.to,
      providerOverride: body.providerOverride,
    });
    return { data };
  }
}
