import type { AuthUser } from '@atlas/api-client';
import type { PortfolioDto } from '../features/portfolio/types';

export const LOCAL_OWNER_ID = 'local-owner';
export const LOCAL_OWNER_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_OWNER_PORTFOLIO_ID = '00000000-0000-4000-8000-000000000002';

export const LOCAL_OWNER_USER: AuthUser = {
  id: LOCAL_OWNER_ID,
  email: 'owner@atlas.local',
  name: 'Owner',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  baseCurrency: 'BRL',
  createdAt: '2026-01-01T00:00:00Z',
};

export const DEFAULT_LOCAL_OWNER_PORTFOLIO: PortfolioDto = {
  id: LOCAL_OWNER_PORTFOLIO_ID,
  name: 'Carteira Principal',
  baseCurrency: 'BRL',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
