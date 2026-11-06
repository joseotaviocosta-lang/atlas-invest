import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { logger } from '@atlas/logger';
import { Portfolio, Institution, Account } from '@atlas/domain';
import {
  USER_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  INSTITUTION_REPOSITORY,
  ACCOUNT_REPOSITORY,
} from '../../database/tokens';
import {
  IUserRepository,
  IPortfolioRepository,
  IInstitutionRepository,
  IAccountRepository,
} from '@atlas/database';
import {
  LOCAL_OWNER_USER_ID,
  LOCAL_OWNER_PORTFOLIO_ID,
  LOCAL_OWNER_INSTITUTION_ID,
  LOCAL_OWNER_ACCOUNT_ID,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_NAME,
} from '../constants/local-owner.constants';

@Injectable()
export class LocalOwnerBootstrapService implements OnApplicationBootstrap {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutionRepository: IInstitutionRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test' && process.env.ATLAS_LOCAL_OWNER_MODE !== 'true') {
      return;
    }
    await this.bootstrapLocalOwner();
  }

  async bootstrapLocalOwner(): Promise<void> {
    try {
      // 1. Technical Local Owner User
      let user = await this.userRepository.findById(LOCAL_OWNER_USER_ID);
      if (!user) {
        user = await this.userRepository.findByEmail(LOCAL_OWNER_EMAIL);
      }

      if (!user) {
        user = await this.userRepository.create({
          id: LOCAL_OWNER_USER_ID,
          email: LOCAL_OWNER_EMAIL,
          name: LOCAL_OWNER_NAME,
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$localownerpassworddisabled$0123456789abcdef',
          locale: 'pt-BR',
          timezone: 'America/Sao_Paulo',
          baseCurrency: 'BRL',
        });
        logger.info('[LocalOwnerBootstrap] Created technical local owner user', {
          userId: user.id,
          email: user.email,
        });
      }

      // 2. Default Portfolio
      const portfolios = await this.portfolioRepository.findByUserId(user.id);
      let portfolio = portfolios.find((p) => p.id === LOCAL_OWNER_PORTFOLIO_ID);

      if (!portfolio && portfolios.length === 0) {
        portfolio = Portfolio.create({
          id: LOCAL_OWNER_PORTFOLIO_ID,
          userId: user.id,
          name: 'Carteira Principal',
          baseCurrency: 'BRL',
        });
        await this.portfolioRepository.create(portfolio);
        logger.info('[LocalOwnerBootstrap] Created default local portfolio', {
          portfolioId: portfolio.id,
          name: portfolio.name,
        });
      } else if (!portfolio && portfolios.length > 0) {
        portfolio = portfolios[0];
      }

      // 3. Default Institution & Account (for frictionless local imports/ledger)
      let institution = await this.institutionRepository.findById(LOCAL_OWNER_INSTITUTION_ID);
      if (!institution) {
        institution = Institution.create({
          id: LOCAL_OWNER_INSTITUTION_ID,
          name: 'B3 / Corretora Principal',
          type: 'BROKER',
          country: 'BR',
        });
        await this.institutionRepository.create(institution);
      }

      if (portfolio) {
        const accounts = await this.accountRepository.findByPortfolioId(portfolio.id);
        if (accounts.length === 0) {
          const account = Account.create({
            id: LOCAL_OWNER_ACCOUNT_ID,
            portfolioId: portfolio.id,
            institutionId: institution.id,
            name: 'Custódia Principal',
            currency: 'BRL',
          });
          await this.accountRepository.create(account);
          logger.info('[LocalOwnerBootstrap] Created default custody account', {
            accountId: account.id,
            portfolioId: portfolio.id,
          });
        }
      }

      logger.info('[LocalOwnerBootstrap] Local owner runtime environment verified.');
    } catch (error) {
      logger.warn('[LocalOwnerBootstrap] Error bootstrapping local owner profile', {
        error: (error as Error).message,
      });
    }
  }
}
