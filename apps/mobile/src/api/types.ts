export interface AuthUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  timezone: string;
  baseCurrency: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  code?: string;
  details?: unknown;
}

export interface PortfolioDto {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  baseCurrency: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortfolioRequest {
  name: string;
  description?: string;
  baseCurrency?: string;
}
