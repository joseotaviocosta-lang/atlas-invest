import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, Inject } from '@nestjs/common';
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
} from '../../application/portfolios';
import {
  CreatePortfolioDto,
  CreatePortfolioSwaggerDto,
  CreatePortfolioInputSchema,
} from './dto/create-portfolio.dto';
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
