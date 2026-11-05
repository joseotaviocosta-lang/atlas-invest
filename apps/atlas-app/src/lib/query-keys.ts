/**
 * Centralized React Query Keys hierarchy for Atlas Desktop (APP-6).
 *
 * Guarantees consistent query keys, deterministic cache invalidation,
 * and multi-parameter isolation across portfolios and markets.
 */

export const portfolioKeys = {
  all: ['portfolios'] as const,
  lists: () => [...portfolioKeys.all, 'list'] as const,
  list: () => [...portfolioKeys.lists()] as const,
  details: () => [...portfolioKeys.all, 'detail'] as const,
  detail: (id: string) => [...portfolioKeys.details(), id] as const,
  states: () => [...portfolioKeys.all, 'state'] as const,
  state: (id: string, asOf?: string) =>
    [...portfolioKeys.states(), id, asOf ?? 'current'] as const,
  positions: (id: string, accountId?: string, asOf?: string) =>
    [...portfolioKeys.all, 'positions', id, { accountId, asOf }] as const,
  valuations: () => [...portfolioKeys.all, 'valuation'] as const,
  valuation: (id: string) => [...portfolioKeys.valuations(), id] as const,
  allocations: () => [...portfolioKeys.all, 'allocation'] as const,
  allocation: (id: string) => [...portfolioKeys.allocations(), id] as const,
  performances: () => [...portfolioKeys.all, 'performance'] as const,
  performance: (id: string, startDate: string, endDate: string, benchmark?: string) =>
    [...portfolioKeys.performances(), id, { startDate, endDate, benchmark: benchmark ?? '' }] as const,
  performanceSeries: (id: string, startDate: string, endDate: string, benchmark?: string) =>
    [...portfolioKeys.performances(), id, 'series', { startDate, endDate, benchmark: benchmark ?? '' }] as const,
  histories: () => [...portfolioKeys.all, 'history'] as const,
  history: (id: string, filters?: Record<string, unknown>) =>
    [...portfolioKeys.histories(), id, filters ?? {}] as const,
};

export const marketKeys = {
  all: ['market'] as const,
  macroContext: () => [...marketKeys.all, 'macro-context'] as const,
  watchlist: () => [...marketKeys.all, 'watchlist'] as const,
  quotes: (portfolioId: string) => [...marketKeys.all, 'quotes', portfolioId] as const,
};

export const importKeys = {
  all: ['imports'] as const,
  runs: (portfolioId: string) => [...importKeys.all, 'runs', portfolioId] as const,
  run: (portfolioId: string, runId: string) => [...importKeys.all, 'run', portfolioId, runId] as const,
};

export const reviewKeys = {
  all: ['reviews'] as const,
  lists: (params?: Record<string, unknown>) => [...reviewKeys.all, 'list', params ?? {}] as const,
  count: () => [...reviewKeys.all, 'count'] as const,
  detail: (runId: string) => [...reviewKeys.all, 'detail', runId] as const,
};

export const fiscalKeys = {
  all: ['fiscal'] as const,
  monthly: (competence: string) => [...fiscalKeys.all, 'monthly', competence] as const,
  liability: (competence: string) => [...fiscalKeys.all, 'liability', competence] as const,
  inputs: (competence: string) => [...fiscalKeys.all, 'inputs', competence] as const,
  annualPositions: (year: number, portfolioId: string) =>
    [...fiscalKeys.all, 'annual-positions', year, portfolioId] as const,
  annualCapitalMarket: (year: number) =>
    [...fiscalKeys.all, 'annual-capital-market', year] as const,
  annualIncome: (year: number) => [...fiscalKeys.all, 'annual-income', year] as const,
  annualReporting: (year: number) => [...fiscalKeys.all, 'annual-reporting', year] as const,
  compliance: () => [...fiscalKeys.all, 'compliance'] as const,
  costEvidence: (portfolioId: string) => [...fiscalKeys.all, 'cost-evidence', portfolioId] as const,
  incomeIntelligence: (portfolioId: string) => [...fiscalKeys.all, 'income-intelligence', portfolioId] as const,
};
