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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import {
  CreatePortfolioUseCase,
  GetPortfolioUseCase,
  ListPortfoliosUseCase,
  GetPortfolioStateUseCase,
  GetPortfolioPositionsUseCase,
  GetPortfolioHistoryUseCase,
} from '../../application/portfolios';
import {
  CreatePortfolioDto,
  CreatePortfolioSwaggerDto,
  CreatePortfolioInputSchema,
} from './dto/create-portfolio.dto';
import {
  GetPortfolioStateQueryDto,
  GetPortfolioPositionsQueryDto,
  GetPortfolioHistoryQueryDto,
} from './dto/portfolio-queries.dto';
import {
  PortfolioStateResponseSwaggerDto,
  PortfolioPositionsResponseSwaggerDto,
  PortfolioHistoryResponseSwaggerDto,
} from './dto/portfolio-responses.swagger.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios')
export class PortfoliosController {
  constructor(
    @Inject(CreatePortfolioUseCase)
    private readonly createPortfolioUseCase: CreatePortfolioUseCase,
    @Inject(GetPortfolioUseCase)
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    @Inject(ListPortfoliosUseCase)
    private readonly listPortfoliosUseCase: ListPortfoliosUseCase,
    @Inject(GetPortfolioStateUseCase)
    private readonly getPortfolioStateUseCase: GetPortfolioStateUseCase,
    @Inject(GetPortfolioPositionsUseCase)
    private readonly getPortfolioPositionsUseCase: GetPortfolioPositionsUseCase,
    @Inject(GetPortfolioHistoryUseCase)
    private readonly getPortfolioHistoryUseCase: GetPortfolioHistoryUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new investment portfolio for authenticated user' })
  @ApiBody({ type: CreatePortfolioSwaggerDto })
  @ApiResponse({ status: 201, description: 'Portfolio created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or invalid currency' })
  async create(
    @Body(new ZodValidationPipe(CreatePortfolioInputSchema)) dto: CreatePortfolioDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const portfolio = await this.createPortfolioUseCase.execute({
      ...dto,
      userId: principal.userId,
    });
    return {
      data: portfolio.toJSON(),
    };
  }

  @Get(':portfolioId/state')
  @ApiOperation({ summary: 'Get consolidated portfolio derived state (as of optional date)' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({
    status: 200,
    description: 'Derived portfolio state',
    type: PortfolioStateResponseSwaggerDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid asOf date format or non-existent civil date' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or unauthorized' })
  @ApiResponse({
    status: 422,
    description: 'Replay failure due to corrupted/inconsistent transaction ledger',
  })
  async getState(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query() query: GetPortfolioStateQueryDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioStateUseCase.execute({
      portfolioId,
      userId: principal.userId,
      asOfDate: query.asOf,
    });
    return { data };
  }

  @Get(':portfolioId/positions')
  @ApiOperation({
    summary: 'Get portfolio positions (consolidated or account-level, as of optional date)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({
    status: 200,
    description: 'Portfolio positions',
    type: PortfolioPositionsResponseSwaggerDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid asOf date format' })
  @ApiResponse({ status: 404, description: 'Portfolio or account not found' })
  @ApiResponse({ status: 422, description: 'Replay failure' })
  async getPositions(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query() query: GetPortfolioPositionsQueryDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioPositionsUseCase.execute({
      portfolioId,
      userId: principal.userId,
      accountId: query.accountId,
      asOfDate: query.asOf,
    });
    return { data };
  }

  @Get(':portfolioId/history')
  @ApiOperation({
    summary: 'Get categorized, deterministic historical audit events derived from engine replay',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({
    status: 200,
    description: 'Historical audit events',
    type: PortfolioHistoryResponseSwaggerDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid history filter or date range' })
  @ApiResponse({ status: 404, description: 'Portfolio or account not found' })
  @ApiResponse({ status: 422, description: 'Replay failure' })
  async getHistory(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query() query: GetPortfolioHistoryQueryDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.getPortfolioHistoryUseCase.execute({
      portfolioId,
      userId: principal.userId,
      type: query.type,
      from: query.from,
      to: query.to,
      accountId: query.accountId,
      assetId: query.assetId,
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return {
      data: result.items,
      meta: result.meta,
    };
  }

  @Get(':portfolioId')
  @ApiOperation({ summary: 'Get a portfolio by ID (scoped to authenticated user)' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio found' })
  @ApiResponse({ status: 404, description: 'Portfolio not found or belongs to another user' })
  async getById(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const portfolio = await this.getPortfolioUseCase.execute(portfolioId, principal.userId);
    return {
      data: portfolio.toJSON(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List portfolios for the authenticated user' })
  @ApiResponse({ status: 200, description: 'List of portfolios' })
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    const portfolios = await this.listPortfoliosUseCase.execute({ userId: principal.userId });
    return {
      data: portfolios.map((p) => p.toJSON()),
    };
  }
}
