/**
 * Phase 5M — shared synthetic identifiers for the simulated B3 sync suite.
 *
 * 100% fictional: no real CPF, person, account, broker linkage, token or
 * owner data. UUIDs are fixed test constants; tickers are public market
 * symbols, not personal data.
 */

import type { AccountRef, AssetRef } from '@atlas/import-engine';

export const PORTFOLIO_5M = '51111111-1111-4111-8111-111111111111';
export const ACCOUNT_A_5M = '52222222-2222-4222-8222-222222222222';
export const ACCOUNT_B_5M = '53333333-3333-4333-8333-333333333333';
export const ASSET_PETR4_5M = '54444444-4444-4334-8333-444444444444';
export const ASSET_VALE3_5M = '55555555-5555-4555-8555-555555555555';
export const ASSET_HGLG11_5M = '56666666-6666-4666-8666-666666666666';

export const ASSETS_5M: AssetRef[] = [
  { id: ASSET_PETR4_5M, ticker: 'PETR4', exchange: 'B3', status: 'ACTIVE' },
  { id: ASSET_VALE3_5M, ticker: 'VALE3', exchange: 'B3', status: 'ACTIVE' },
  { id: ASSET_HGLG11_5M, ticker: 'HGLG11', exchange: 'B3', status: 'ACTIVE' },
];

export const ACCOUNTS_5M: AccountRef[] = [
  { id: ACCOUNT_A_5M, name: 'CONTA SINTETICA 5M-A' },
  { id: ACCOUNT_B_5M, name: 'CONTA SINTETICA 5M-B' },
];

export const TODAY_5M = '2026-06-30';
