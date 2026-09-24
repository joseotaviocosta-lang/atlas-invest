import { describe, it, expect } from 'vitest';
import {
  buildPortfolioAccountsViewModel,
  buildAccountDetailViewModel,
  PortfolioStateDto,
} from '@atlas/ui';

const portfolioId = 'c0000000-0000-4000-8000-000000000001';
const accountXp = 'd0000000-0000-4000-8000-000000000001';
const accountNu = 'd0000000-0000-4000-8000-000000000002';
const instXp = 'b0000000-0000-4000-8000-000000000001';
const instNu = 'b0000000-0000-4000-8000-000000000002';
const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';
const assetVale3 = 'e0000000-0000-4000-8000-000000000002';

function makeState(): PortfolioStateDto {
  return {
    portfolioId,
    asOfDate: null,
    completeness: { costBasis: 'COMPLETE' },
    positions: [
      {
        assetId: assetPetr4,
        quantity: '100',
        currency: 'BRL',
        costBasisStatus: 'KNOWN',
        totalCost: { amount: '3200.00', currency: 'BRL' },
        averageCost: { amount: '32.00', currency: 'BRL' },
      },
    ],
    accounts: [
      {
        accountId: accountXp,
        positions: [
          {
            assetId: assetPetr4,
            quantity: '100',
            currency: 'BRL',
            costBasisStatus: 'KNOWN',
            totalCost: { amount: '3200.00', currency: 'BRL' },
            averageCost: { amount: '32.00', currency: 'BRL' },
          },
        ],
      },
      {
        accountId: accountNu,
        positions: [
          {
            assetId: assetVale3,
            quantity: '50',
            currency: 'BRL',
            costBasisStatus: 'INCOMPLETE',
            totalCost: null,
            averageCost: null,
          },
        ],
      },
    ],
    realizedSummaries: [],
    incomeSummaries: [],
    cashFlowSummaries: [],
  };
}

const directory = [
  {
    id: accountXp,
    portfolioId,
    institutionId: instXp,
    name: 'XP Conta Investimentos',
    currency: 'BRL',
    status: 'ACTIVE',
  },
  {
    id: accountNu,
    portfolioId,
    institutionId: instNu,
    name: 'NuInvest Custodia',
    currency: 'BRL',
    status: 'ACTIVE',
  },
];

const institutions = [
  { id: instXp, name: 'XP Investimentos' },
  { id: instNu, name: 'Nubank / NuInvest' },
];

describe('UI: Portfolio Accounts View Model (Fase 2E)', () => {
  describe('overview', () => {
    it('lists every directory account with institution metadata and open-position counts', () => {
      const vm = buildPortfolioAccountsViewModel({
        portfolioId,
        portfolioName: 'Carteira Principal',
        state: makeState(),
        accountsMeta: directory,
        institutionsMeta: institutions,
      });

      expect(vm.accountsCount).toBe(2);
      expect(vm.isEmpty).toBe(false);

      const xp = vm.accounts.find((a) => a.accountId === accountXp)!;
      expect(xp.accountName).toBe('XP Conta Investimentos');
      expect(xp.institutionId).toBe(instXp);
      expect(xp.institutionName).toBe('XP Investimentos');
      expect(xp.currency).toBe('BRL');
      expect(xp.statusLabel).toBe('Ativa');
      expect(xp.openPositionsCount).toBe(1);
      expect(xp.hasIncompleteCost).toBe(false);
      expect(xp.isEmpty).toBe(false);
    });

    it('flags incomplete cost without fabricating values', () => {
      const vm = buildPortfolioAccountsViewModel({
        portfolioId,
        state: makeState(),
        accountsMeta: directory,
        institutionsMeta: institutions,
      });

      const nu = vm.accounts.find((a) => a.accountId === accountNu)!;
      expect(nu.hasIncompleteCost).toBe(true);
      expect(nu.openPositionsCount).toBe(1);
      expect(nu.isEmpty).toBe(false);
    });

    it('marks directory accounts with no open positions as empty', () => {
      const vm = buildPortfolioAccountsViewModel({
        portfolioId,
        state: makeState(),
        accountsMeta: [
          ...directory,
          {
            id: 'd0000000-0000-4000-8000-000000000003',
            portfolioId,
            institutionId: instXp,
            name: 'Conta Vazia',
            currency: 'USD',
            status: 'ACTIVE',
          },
        ],
        institutionsMeta: institutions,
      });

      const empty = vm.accounts.find((a) => a.accountName === 'Conta Vazia')!;
      expect(empty.isEmpty).toBe(true);
      expect(empty.openPositionsCount).toBe(0);
      expect(empty.currency).toBe('USD');
    });

    it('keeps account identity on accountId and degrades unknown institutions to null', () => {
      const vm = buildPortfolioAccountsViewModel({
        portfolioId,
        state: makeState(),
        accountsMeta: [
          {
            id: accountXp,
            name: 'XP Conta Investimentos',
            institutionId: 'unknown-inst',
            currency: 'BRL',
            status: 'ACTIVE',
          },
        ],
        institutionsMeta: institutions,
      });

      const xp = vm.accounts[0]!;
      expect(xp.accountId).toBe(accountXp);
      expect(xp.institutionId).toBe('unknown-inst');
      expect(xp.institutionName).toBeNull();
    });

    it('returns an empty overview when the directory is empty', () => {
      const vm = buildPortfolioAccountsViewModel({
        portfolioId,
        state: makeState(),
        accountsMeta: [],
        institutionsMeta: [],
      });

      expect(vm.accounts).toHaveLength(0);
      expect(vm.isEmpty).toBe(true);
    });
  });

  describe('detail', () => {
    it('projects account-specific positions with formatted costs', () => {
      const vm = buildAccountDetailViewModel({
        portfolioId,
        accountId: accountXp,
        state: makeState(),
        accountsMeta: directory,
        institutionsMeta: institutions,
        assetsMeta: [{ id: assetPetr4, ticker: 'PETR4', name: 'Petrobras PN' }],
      });

      expect(vm.found).toBe(true);
      expect(vm.accountName).toBe('XP Conta Investimentos');
      expect(vm.institutionName).toBe('XP Investimentos');
      expect(vm.currency).toBe('BRL');
      expect(vm.openPositionsCount).toBe(1);
      expect(vm.isEmpty).toBe(false);

      const pos = vm.positions[0]!;
      expect(pos.assetId).toBe(assetPetr4);
      expect(pos.assetTicker).toBe('PETR4');
      expect(pos.quantity).toBe('100');
      expect(pos.averageCost).toBe('R$ 32,00');
      expect(pos.totalCost).toBe('R$ 3.200,00');
      expect(pos.isCostBasisIncomplete).toBe(false);
      expect(pos.canNavigateToAsset).toBe(true);
    });

    it('renders incomplete average/total cost strictly as —', () => {
      const vm = buildAccountDetailViewModel({
        portfolioId,
        accountId: accountNu,
        state: makeState(),
        accountsMeta: directory,
        institutionsMeta: institutions,
      });

      expect(vm.found).toBe(true);
      expect(vm.hasIncompleteCost).toBe(true);

      const pos = vm.positions[0]!;
      expect(pos.costBasisStatus).toBe('INCOMPLETE');
      expect(pos.averageCost).toBe('—');
      expect(pos.totalCost).toBe('—');
      expect(pos.quantity).toBe('50');
    });

    it('hides foreign accounts with found:false instead of leaking data', () => {
      const vm = buildAccountDetailViewModel({
        portfolioId,
        accountId: 'd0000000-0000-4000-8000-999999999999',
        state: makeState(),
        accountsMeta: directory,
        institutionsMeta: institutions,
      });

      expect(vm.found).toBe(false);
      expect(vm.accountName).toBeNull();
      expect(vm.positions).toHaveLength(0);
      expect(vm.isEmpty).toBe(true);
    });

    it('never navigates to assets without an open portfolio position', () => {
      const state = makeState();
      state.positions = [];
      const vm = buildAccountDetailViewModel({
        portfolioId,
        accountId: accountXp,
        state,
        accountsMeta: directory,
        institutionsMeta: institutions,
      });

      expect(vm.positions[0]!.canNavigateToAsset).toBe(false);
    });
  });
});
