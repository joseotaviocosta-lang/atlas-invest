import { Controller, Get, Post, Body, Param, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import {
  UpdateMacroDataUseCase,
  GetMacroCoverageUseCase,
  GetMacroLatestUseCase,
  GetMacroContextUseCase,
  SyncMacroDataUseCase,
} from '../../application/macro';

export class UpdateMacroDto {
  from!: string;
  to!: string;
  providerOverride?: 'BCB' | 'IN_MEMORY';
}

@ApiTags('Macro')
@ApiBearerAuth()
@Controller('api/v1/macro')
export class MacroController {
  constructor(
    @Inject(UpdateMacroDataUseCase)
    private readonly updateMacroDataUseCase: UpdateMacroDataUseCase,
    @Inject(GetMacroCoverageUseCase)
    private readonly getMacroCoverageUseCase: GetMacroCoverageUseCase,
    @Inject(GetMacroLatestUseCase)
    private readonly getMacroLatestUseCase: GetMacroLatestUseCase,
    @Inject(GetMacroContextUseCase)
    private readonly getMacroContextUseCase: GetMacroContextUseCase,
    @Inject(SyncMacroDataUseCase)
    private readonly syncMacroDataUseCase: SyncMacroDataUseCase,
  ) {}

  @Get('context')
  @ApiOperation({
    summary: 'Get unified macroeconomic context (latest IPCA, SELIC_TARGET, SELIC_EFFECTIVE, and PTAX)',
  })
  @ApiResponse({ status: 200, description: 'Macro context summary' })
  async getContext() {
    const data = await this.getMacroContextUseCase.execute();
    return { data };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Synchronize official macroeconomic indicators from authoritative sources (Bacen & IBGE)',
  })
  @ApiResponse({ status: 200, description: 'Macro synchronization receipt' })
  async refreshMacro() {
    const data = await this.syncMacroDataUseCase.execute();
    return { data };
  }

  @Get(':seriesId/coverage')
  @ApiOperation({
    summary:
      'Get persisted coverage for a macroeconomic series (IPCA, SELIC_TARGET, SELIC_EFFECTIVE, PTAX)',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Macro series identifier (IPCA, SELIC_TARGET, SELIC_EFFECTIVE, PTAX)',
    example: 'IPCA',
  })
  @ApiResponse({ status: 200, description: 'Macro coverage details' })
  @ApiResponse({ status: 400, description: 'Unsupported macro series' })
  async getCoverage(@Param('seriesId') seriesId: string) {
    const data = await this.getMacroCoverageUseCase.execute({ seriesId });
    return { data };
  }

  @Get(':seriesId/latest')
  @ApiOperation({
    summary: 'Get latest persisted observation for a macroeconomic series',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Macro series identifier (IPCA, SELIC_TARGET, SELIC_EFFECTIVE, PTAX)',
    example: 'SELIC_TARGET',
  })
  @ApiResponse({ status: 200, description: 'Latest macro observation' })
  @ApiResponse({ status: 404, description: 'No observations found for this series' })
  async getLatest(@Param('seriesId') seriesId: string) {
    const data = await this.getMacroLatestUseCase.execute({ seriesId });
    return {
      data: {
        seriesId: data.seriesId,
        referenceDate: data.referenceDate.toString(),
        value: data.value.toString(),
        unit: data.unit,
        frequency: data.frequency,
        source: data.source,
        publishedAt: data.publishedAt ? data.publishedAt.toISOString() : undefined,
      },
    };
  }

  @Post(':seriesId/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update/backfill macroeconomic series from authoritative sources (BCB SGS)',
  })
  @ApiParam({
    name: 'seriesId',
    description: 'Macro series identifier (IPCA, SELIC_TARGET, SELIC_EFFECTIVE, PTAX)',
    example: 'IPCA',
  })
  @ApiBody({ type: UpdateMacroDto })
  @ApiResponse({ status: 200, description: 'Macro ingestion receipt' })
  @ApiResponse({ status: 400, description: 'Unsupported series or invalid date range' })
  async updateMacro(@Param('seriesId') seriesId: string, @Body() body: UpdateMacroDto) {
    const data = await this.updateMacroDataUseCase.execute({
      seriesId,
      from: body.from,
      to: body.to,
      providerOverride: body.providerOverride,
    });
    return { data };
  }
}
