import { PersistenceError } from './persistence-error';

export class CrossPortfolioIntegrityError extends PersistenceError {
  constructor(message = 'Account does not belong to the target portfolio.') {
    super(message, 'PERSISTENCE.CROSS_PORTFOLIO_INTEGRITY');
  }
}
