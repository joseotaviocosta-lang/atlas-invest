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
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { serializeTransaction } from '@atlas/domain';
import {
  CreateTransactionUseCase,
  GetTransactionUseCase,
  ListTransactionsUseCase,
} from '../../application/transactions';
import {
  CreateTransactionBody,
  CreateTransactionBodySchema,
  CreateTransactionSwaggerDto,
} from './dto/create-transaction.dto';
import { ListTransactionsQuery, ListTransactionsQuerySchema } from './dto/list-transactions.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('api/v1/portfolios/:portfolioId/transactions')
export class PortfolioTransactionsController {
  constructor(
    @Inject(CreateTransactionUseCase)
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    @Inject(ListTransactionsUseCase)
    private readonly listTransactionsUseCase: ListTransactionsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Append a new immutable transaction to the ledger',
    description:
      'Creates a new transaction event in the portfolio ledger. Ledger is strictly append-only; updates and deletions are prohibited.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the target portfolio' })
  @ApiBody({ type: CreateTransactionSwaggerDto })
  @ApiResponse({ status: 201, description: 'Transaction appended successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or domain rule violated' })
  @ApiResponse({ status: 404, description: 'Portfolio, account, or asset not found' })
  @ApiResponse({
    status: 409,
    description: 'Cross-portfolio integrity violation or duplicate external transaction',
  })
  async create(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(CreateTransactionBodySchema)) body: CreateTransactionBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const tx = await this.createTransactionUseCase.execute({
      portfolioId,
      accountId: body.accountId,
      type: body.type,
      currency: body.currency,
      tradeDate: body.tradeDate,
      settlementDate: body.settlementDate,
      source: body.source,
      provider: body.provider,
      externalId: body.externalId,
      notes: body.notes,
      assetId: body.assetId,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      fees: body.fees,
      taxes: body.taxes,
      amount: body.amount,
      factor: body.factor,
      userId: principal.userId,
    });

    return {
      data: serializeTransaction(tx),
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List transactions for a portfolio with cursor-based pagination and filtering',
    description:
      'Returns ledger transactions sorted deterministically by tradeDate ASC, createdAt ASC, id ASC.',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'accountId', required: false, description: 'Filter by account UUID' })
  @ApiQuery({ name: 'assetId', required: false, description: 'Filter by asset UUID' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by transaction type' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter tradeDate >= startDate (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter tradeDate <= endDate (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Pagination cursor (transaction UUID)',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items (1-100, default 50)' })
  @ApiResponse({ status: 200, description: 'Paginated transactions list' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async list(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query(new ZodValidationPipe(ListTransactionsQuerySchema)) query: ListTransactionsQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const result = await this.listTransactionsUseCase.execute({
      portfolioId,
      accountId: query.accountId,
      assetId: query.assetId,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      cursor: query.cursor,
      limit: query.limit,
      userId: principal.userId,
    });

    return {
      data: result.items.map(serializeTransaction),
      meta: {
        limit: result.limit,
        cursor: result.cursor ?? null,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }
}

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('api/v1/transactions')
export class TransactionsController {
  constructor(
    @Inject(GetTransactionUseCase)
    private readonly getTransactionUseCase: GetTransactionUseCase,
  ) {}

  @Get(':transactionId')
  @ApiOperation({ summary: 'Get a specific transaction by ID' })
  @ApiParam({ name: 'transactionId', description: 'UUID of the transaction' })
  @ApiResponse({ status: 200, description: 'Transaction found' })
  @ApiResponse({ status: 404, description: 'Transaction not found or belongs to another user' })
  async getById(
    @Param('transactionId', UUIDParamPipe) transactionId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const tx = await this.getTransactionUseCase.execute(transactionId, principal.userId);
    return {
      data: serializeTransaction(tx),
    };
  }
}
