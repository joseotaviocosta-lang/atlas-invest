import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { WatchlistService } from './watchlist.service';
import { AddWatchlistDto, AddWatchlistSchema, AddWatchlistSwaggerDto } from './dto/watchlist.dto';

@ApiTags('Watchlist')
@ApiBearerAuth()
@Controller('api/v1/watchlist')
export class WatchlistController {
  constructor(
    @Inject(WatchlistService)
    private readonly watchlistService: WatchlistService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List watched assets for authenticated user' })
  @ApiResponse({ status: 200, description: 'List of watched assets with latest quotes' })
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const data = await this.watchlistService.list(principal.userId);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an asset to user watchlist' })
  @ApiBody({ type: AddWatchlistSwaggerDto })
  @ApiResponse({ status: 201, description: 'Asset added to watchlist' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async add(
    @Body(new ZodValidationPipe(AddWatchlistSchema)) dto: AddWatchlistDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.watchlistService.add(principal.userId, dto.assetId);
    return { data };
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an asset from user watchlist' })
  @ApiParam({ name: 'assetId', description: 'UUID of the asset to unwatch' })
  @ApiResponse({ status: 200, description: 'Asset removed from watchlist' })
  @ApiResponse({ status: 404, description: 'Watchlist item not found' })
  async remove(
    @Param('assetId', UUIDParamPipe) assetId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.watchlistService.remove(principal.userId, assetId);
    return { data };
  }
}
