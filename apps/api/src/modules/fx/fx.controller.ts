import { Controller, Get, Post, Body, Param, Inject, HttpCode, HttpStatus } from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { UpdateFxDataUseCase, GetFxCoverageUseCase } from '../../application/fx';

export class UpdateFxDataDto {
  from!: string;
  to!: string;
  providerOverride?: 'BCB' | 'IN_MEMORY';
}

@ApiTags('FX')
@ApiBearerAuth()
@Controller('api/v1/fx')
export class FxController {
  constructor(
    @Inject(UpdateFxDataUseCase)
    private readonly updateFxDataUseCase: UpdateFxDataUseCase,
    @Inject(GetFxCoverageUseCase)
    private readonly getFxCoverageUseCase: GetFxCoverageUseCase,
  ) {}

  @Get(':baseCurrency/:quoteCurrency/coverage')
  @ApiOperation({
    summary: 'Get persisted exchange rate coverage for a currency pair (e.g. USD/BRL)',
  })
  @ApiParam({ name: 'baseCurrency', description: 'Base currency ISO code (e.g. USD)' })
  @ApiParam({ name: 'quoteCurrency', description: 'Quote currency ISO code (e.g. BRL)' })
  @ApiResponse({ status: 200, description: 'FX coverage details' })
  @ApiResponse({ status: 400, description: 'Unsupported currency or invalid parameters' })
  async getCoverage(
    @Param('baseCurrency') baseCurrency: string,
    @Param('quoteCurrency') quoteCurrency: string,
  ) {
    const data = await this.getFxCoverageUseCase.execute(
      baseCurrency.trim().toUpperCase(),
      quoteCurrency.trim().toUpperCase(),
    );
    return { data };
  }

  @Post(':baseCurrency/:quoteCurrency/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update/backfill persisted FX observations from authoritative source (BCB PTAX)',
  })
  @ApiParam({ name: 'baseCurrency', description: 'Base currency ISO code (e.g. USD)' })
  @ApiParam({ name: 'quoteCurrency', description: 'Quote currency ISO code (e.g. BRL)' })
  @ApiBody({ type: UpdateFxDataDto })
  @ApiResponse({ status: 200, description: 'FX ingestion receipt' })
  @ApiResponse({ status: 400, description: 'Unsupported currency or invalid date range' })
  async updateFx(
    @Param('baseCurrency') baseCurrency: string,
    @Param('quoteCurrency') quoteCurrency: string,
    @Body() body: UpdateFxDataDto,
  ) {
    const data = await this.updateFxDataUseCase.execute({
      baseCurrency: baseCurrency.trim().toUpperCase(),
      quoteCurrency: quoteCurrency.trim().toUpperCase(),
      from: body.from,
      to: body.to,
      providerOverride: body.providerOverride,
    });
    return { data };
  }
}
