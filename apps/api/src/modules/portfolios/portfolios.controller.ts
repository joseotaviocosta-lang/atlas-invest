import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import {
  CreatePortfolioUseCase,
  GetPortfolioUseCase,
  ListPortfoliosUseCase,
} from '../../application/portfolios';
import {
  CreatePortfolioDto,
  CreatePortfolioSwaggerDto,
  PortfolioInputSchema,
} from './dto/create-portfolio.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';

@ApiTags('Portfolios')
@Controller('api/v1/portfolios')
export class PortfoliosController {
  constructor(
    private readonly createPortfolioUseCase: CreatePortfolioUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly listPortfoliosUseCase: ListPortfoliosUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new investment portfolio' })
  @ApiBody({ type: CreatePortfolioSwaggerDto })
  @ApiResponse({ status: 201, description: 'Portfolio created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or invalid currency' })
  @UsePipes(new ZodValidationPipe(PortfolioInputSchema))
  async create(@Body() dto: CreatePortfolioDto) {
    const portfolio = await this.createPortfolioUseCase.execute(dto);
    return {
      data: portfolio.toJSON(),
    };
  }

  @Get(':portfolioId')
  @ApiOperation({ summary: 'Get a portfolio by ID' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio found' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getById(@Param('portfolioId', UUIDParamPipe) portfolioId: string) {
    const portfolio = await this.getPortfolioUseCase.execute(portfolioId);
    return {
      data: portfolio.toJSON(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List portfolios for a user' })
  @ApiQuery({ name: 'userId', required: true, description: 'UUID of the user' })
  @ApiResponse({ status: 200, description: 'List of portfolios' })
  @ApiResponse({ status: 400, description: 'User ID is required' })
  async list(@Query('userId') userId: string) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('Query parameter "userId" is required');
    }
    const portfolios = await this.listPortfoliosUseCase.execute({ userId: userId.trim() });
    return {
      data: portfolios.map((p) => p.toJSON()),
    };
  }
}
