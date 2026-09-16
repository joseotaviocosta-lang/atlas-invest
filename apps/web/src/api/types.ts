import { PortfolioType, PortfolioStatus, PORTFOLIO_TYPES } from '@atlas/domain';

export { PORTFOLIO_TYPES };
export type { PortfolioType, PortfolioStatus };

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
}

export interface AuthResponseData {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}

export interface RefreshResponseData {
  accessToken: string;
  expiresIn: number;
}

export interface ApiErrorResponse {
  statusCode?: number;
  message: string | string[];
  code?: string;
  details?: unknown;
}

export interface PortfolioDto {
  id: string;
  userId: string;
  name: string;
  baseCurrency: string;
  type: PortfolioType;
  status: PortfolioStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortfolioRequest {
  name: string;
  baseCurrency: string;
  type?: PortfolioType;
}
