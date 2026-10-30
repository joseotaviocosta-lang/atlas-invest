import {
  Inject,
  Injectable,
  Optional,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  IPortfolioRepository,
  ITransactionRepository,
  IAccountRepository,
  ITransactionRectificationRepository,
  IAssetRepository,
} from '@atlas/database';
import { LocalDate } from '@atlas/domain';
import { replayPortfolio, PortfolioReplayError } from '@atlas/portfolio-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  TRANSACTION_RECTIFICATION_REPOSITORY,
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import { attachRectificationBadges } from '../transactions/transaction-rectification.view';
import { PortfolioHistoryReadModel } from './read-models';
import { PortfolioReadModelMapper } from './mappers/portfolio-read-model.mapper';

export interface GetPortfolioHistoryParams {
  portfolioId: string;
  userId: string;
  type?: 'realized' | 'income' | 'cash-flow' | 'corporate-action' | 'transfer';
  from?: string;
  to?: string;
  accountId?: string;
  assetId?: string;
  cursor?: string;
  limit?: number;
}

const VALID_HISTORY_TYPES = new Set([
  'realized',
  'income',
  'cash-flow',
  'corporate-action',
  'transfer',
]);

@Injectable()
export class GetPortfolioHistoryUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(TRANSACTION_RECTIFICATION_REPOSITORY)
    private readonly rectifications: ITransactionRectificationRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Optional()
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository?: IAssetRepository,
  ) {}

  async execute(params: GetPortfolioHistoryParams): Promise<PortfolioHistoryReadModel> {
    // 1. Ownership validation
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    // 2. Account scope validation (if specified, account must belong to target portfolio)
    if (params.accountId) {
      const account = await this.accountRepository.findById(params.accountId);
      if (!account || account.portfolioId !== params.portfolioId) {
        throw new NotFoundException({
          message: `Account with id '${params.accountId}' not found in portfolio '${params.portfolioId}'`,
          code: 'PORTFOLIO.INVALID_ACCOUNT_SCOPE',
        });
      }
    }

    // 3. Type validation
    if (params.type && !VALID_HISTORY_TYPES.has(params.type)) {
      throw new BadRequestException({
        message: `Invalid history type '${params.type}'. Valid types: ${Array.from(VALID_HISTORY_TYPES).join(', ')}`,
        code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
      });
    }

    // 4. Date validation
    let fromLocalDate: LocalDate | undefined;
    if (params.from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
        throw new BadRequestException({
          message: `Invalid 'from' date format: '${params.from}'. Expected format: YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
      try {
        fromLocalDate = LocalDate.from(params.from);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil calendar date '${params.from}'`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    }

    let toLocalDate: LocalDate | undefined;
    if (params.to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
        throw new BadRequestException({
          message: `Invalid 'to' date format: '${params.to}'. Expected format: YYYY-MM-DD`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
      try {
        toLocalDate = LocalDate.from(params.to);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message ?? `Invalid civil calendar date '${params.to}'`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    }

    if (fromLocalDate && toLocalDate && fromLocalDate.compare(toLocalDate) > 0) {
      throw new BadRequestException({
        message: `Invalid date range: 'from' date (${params.from}) must be less than or equal to 'to' date (${params.to})`,
        code: 'PORTFOLIO.INVALID_DATE_RANGE',
      });
    }

    // 5. Limit validation
    if (params.limit !== undefined) {
      if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 200) {
        throw new BadRequestException({
          message: `Invalid limit: '${params.limit}'. Must be an integer between 1 and 200`,
          code: 'PORTFOLIO.INVALID_HISTORY_FILTER',
        });
      }
    }

    // 6. Load transactions (optimizing with endDate if 'to' is specified)
    const transactions = await this.transactionRepository.findByPortfolioId(params.portfolioId, {
      endDate: toLocalDate,
    });

    // 6. Deterministic replay
    try {
      const result = replayPortfolio({
        portfolioId: params.portfolioId,
        transactions,
        asOfDate: toLocalDate,
      });

      // 7. Map and filter to pure Application History Read Model
      const history = PortfolioReadModelMapper.toHistoryReadModel(result, {
        type: params.type,
        from: fromLocalDate ? fromLocalDate.toString() : undefined,
        to: toLocalDate ? toLocalDate.toString() : undefined,
        accountId: params.accountId,
        assetId: params.assetId,
        cursor: params.cursor,
        limit: params.limit,
      });

      // 8. Attach rectification badges (bounded batch over the page).
      const badges =
        this.rectifications && typeof this.rectifications.listByOriginalTransactionIds === 'function'
          ? await attachRectificationBadges(
              { rectifications: this.rectifications },
              params.portfolioId,
              history.items.map((item) => item.transactionId),
            )
          : new Map();

      // 9. Batch asset lookup to enrich items with ticker & assetName (no N+1).
      // Conversion targets are included so CORPORATE_ACTION details can carry
      // the parent ticker (PART Z/AA).
      const uniqueAssetIds = Array.from(
        new Set(
          history.items
            .flatMap((item) => [
              item.assetId,
              (item.details as { targetAssetId?: unknown }).targetAssetId,
            ])
            .filter((id): id is string => typeof id === 'string' && id !== ''),
        ),
      );
      const assets =
        uniqueAssetIds.length > 0 && this.assetRepository
          ? await this.assetRepository.findByIds(uniqueAssetIds)
          : [];
      const assetMap = new Map<string, (typeof assets)[number]>(
        assets.map((a) => [String(a.id), a]),
      );
      const txMap = new Map<string, (typeof transactions)[number]>(
        transactions.map((t) => [String(t.id), t]),
      );

      return {
        ...history,
        items: history.items.map((item) => {
          const asset = item.assetId ? assetMap.get(item.assetId) : null;
          const tx = txMap.get(item.transactionId);
          // Opening baseline legs are TRANSFER_IN only (rawOperation POSICAO_INICIAL
          // from B3 annual reports). The direction guard prevents ever mislabeling
          // a TRANSFER_OUT as "Posição inicial"; provenance comes from import notes
          // (buildNotes appends the candidate notes incl. "Posição em DD/MM/AAAA").
          const transferDirection = (item.details as { type?: unknown }).type;
          const isOpening =
            item.kind === 'TRANSFER' &&
            transferDirection === 'TRANSFER_IN' &&
            Boolean(
              tx &&
                (tx.notes?.includes('Posição em') ||
                  tx.notes?.includes('Posição inicial') ||
                  tx.notes?.includes('Posição Inicial') ||
                  tx.notes?.includes('relatorio-consolidado-anual') ||
                  tx.notes?.includes('Posição de Abertura')),
            );

          return {
            ...item,
            assetTicker: asset?.ticker ?? null,
            assetName: asset?.name ?? null,
            rectification: badges.get(item.transactionId) ?? null,
            details: {
              ...item.details,
              ...(isOpening ? { isOpeningPosition: true } : {}),
              ...(() => {
                const targetId = (item.details as { targetAssetId?: unknown }).targetAssetId;
                if (typeof targetId !== 'string' || targetId === '') return {};
                const target = assetMap.get(targetId);
                return {
                  targetAssetTicker: target?.ticker ?? null,
                  targetAssetName: target?.name ?? null,
                };
              })(),
            },
          };
        }),
      };
    } catch (err: unknown) {
      if (err instanceof PortfolioReplayError) {
        throw new UnprocessableEntityException({
          message: err.message,
          code: 'PORTFOLIO.REPLAY_FAILED',
        });
      }
      throw err;
    }
  }
}
