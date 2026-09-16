import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import {
  CreateAccountUseCase,
  GetAccountUseCase,
  ListAccountsUseCase,
} from '../../application/accounts';
import {
  CreateAccountBody,
  CreateAccountBodySchema,
  CreateAccountSwaggerDto,
} from './dto/create-account.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';

@ApiTags('Accounts')
@Controller('api/v1/portfolios/:portfolioId/accounts')
export class PortfolioAccountsController {
  constructor(
    @Inject(CreateAccountUseCase)
    private readonly createAccountUseCase: CreateAccountUseCase,
    @Inject(ListAccountsUseCase)
    private readonly listAccountsUseCase: ListAccountsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account in a portfolio' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: CreateAccountSwaggerDto })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 404, description: 'Portfolio or institution not found' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CreateAccountBodySchema)) body: CreateAccountBody,
  ) {
    const account = await this.createAccountUseCase.execute({
      portfolioId,
      institutionId: body.institutionId,
      name: body.name,
      currency: body.currency,
      status: body.status,
    });
    return {
      data: account.toJSON(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all accounts in a portfolio' })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'List of accounts' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async list(@Param('portfolioId', UUIDParamPipe) portfolioId: string) {
    const accounts = await this.listAccountsUseCase.execute(portfolioId);
    return {
      data: accounts.map((a) => a.toJSON()),
    };
  }
}

@ApiTags('Accounts')
@Controller('api/v1/accounts')
export class AccountsController {
  constructor(
    @Inject(GetAccountUseCase)
    private readonly getAccountUseCase: GetAccountUseCase,
  ) {}

  @Get(':accountId')
  @ApiOperation({ summary: 'Get an account by ID' })
  @ApiParam({ name: 'accountId', description: 'UUID of the account' })
  @ApiResponse({ status: 200, description: 'Account found' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getById(@Param('accountId', UUIDParamPipe) accountId: string) {
    const account = await this.getAccountUseCase.execute(accountId);
    return {
      data: account.toJSON(),
    };
  }
}
