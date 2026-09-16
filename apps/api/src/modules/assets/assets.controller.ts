import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { AssetType } from '@atlas/domain';
import {
  CreateAssetUseCase,
  GetAssetUseCase,
  SearchAssetsUseCase,
} from '../../application/assets';
import {
  CreateAssetDto,
  CreateAssetSwaggerDto,
  AssetInputSchema,
} from './dto/create-asset.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';

@ApiTags('Assets')
@Controller('api/v1/assets')
export class AssetsController {
  constructor(
    @Inject(CreateAssetUseCase)
    private readonly createAssetUseCase: CreateAssetUseCase,
    @Inject(GetAssetUseCase)
    private readonly getAssetUseCase: GetAssetUseCase,
    @Inject(SearchAssetsUseCase)
    private readonly searchAssetsUseCase: SearchAssetsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new tradable asset' })
  @ApiBody({ type: CreateAssetSwaggerDto })
  @ApiResponse({ status: 201, description: 'Asset registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(
    @Body(new ZodValidationPipe(AssetInputSchema)) dto: CreateAssetDto,
  ) {
    const asset = await this.createAssetUseCase.execute(dto);
    return {
      data: asset.toJSON(),
    };
  }

  @Get(':assetId')
  @ApiOperation({ summary: 'Get an asset by ID' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset' })
  @ApiResponse({ status: 200, description: 'Asset found' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async getById(@Param('assetId', UUIDParamPipe) assetId: string) {
    const asset = await this.getAssetUseCase.execute(assetId);
    return {
      data: asset.toJSON(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Search and filter assets' })
  @ApiQuery({ name: 'q', required: false, description: 'Search term for ticker or name' })
  @ApiQuery({ name: 'exchange', required: false, description: 'Exchange filter (e.g. BVMF, NASDAQ)' })
  @ApiQuery({ name: 'type', required: false, description: 'Asset type filter (e.g. EQUITY, FII, ETF)' })
  @ApiResponse({ status: 200, description: 'List of assets' })
  async search(
    @Query('q') q?: string,
    @Query('exchange') exchange?: string,
    @Query('type') type?: string,
  ) {
    const assets = await this.searchAssetsUseCase.execute({
      q,
      exchange,
      type: type as AssetType | undefined,
    });
    return {
      data: assets.map((a) => a.toJSON()),
    };
  }
}
