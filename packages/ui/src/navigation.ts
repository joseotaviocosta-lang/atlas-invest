/**
 * Canonical Navigation Definition for Project Atlas.
 * Shared across Mobile (bottom tabs) and Web (desktop sidebar / mobile nav).
 */

export interface NavItemConfig {
  id: 'today' | 'portfolio' | 'market' | 'tax' | 'ai';
  label: string;
  path: string;
  description: string;
  iconName: string;
  order: number;
}

export const CANONICAL_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'today',
    label: 'Hoje',
    path: '/today',
    description: 'Resumo diário do investidor',
    iconName: 'home',
    order: 1,
  },
  {
    id: 'portfolio',
    label: 'Carteira',
    path: '/portfolio',
    description: 'Patrimônio, posições e operações',
    iconName: 'pie-chart',
    order: 2,
  },
  {
    id: 'market',
    label: 'Mercado',
    path: '/market',
    description: 'Radar de cotações e calendário',
    iconName: 'trending-up',
    order: 3,
  },
  {
    id: 'tax',
    label: 'Fiscal',
    path: '/tax',
    description: 'Tributação, DARF e IRPF',
    iconName: 'file-text',
    order: 4,
  },
  {
    id: 'ai',
    label: 'IA',
    path: '/ai',
    description: 'Assistente contextual inteligente',
    iconName: 'zap',
    order: 5,
  },
] as const;

export const PROFILE_NAV_ITEM = {
  id: 'profile',
  label: 'Perfil',
  path: '/profile',
  description: 'Dados pessoais, preferências e segurança',
  iconName: 'user',
} as const;
