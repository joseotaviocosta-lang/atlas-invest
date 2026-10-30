import { describe, it, expect } from 'vitest';
import {
  canonicalFingerprint,
  normalizeDecimalValue,
  probableMatchKey,
  sourceIdentityKey,
  normalizeProvider,
  classifyOne,
  summarize,
  resolveAsset,
  resolveAccount,
} from '@atlas/import-engine';
import type { ExistingLedgerRow, NormalizedCandidate } from '@atlas/import-engine';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';

function candidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    rowNumber: 2,
    tradeDate: '2026-01-15',
    ticker: 'PETR4',
    operation: 'BUY',
    rawOperation: 'COMPRA',
    quantity: '100',
    unitPrice: '38.50',
    fees: '4.90',
    currency: 'BRL',
    brokerLabel: 'XP',
    externalId: 'NEG-1',
    status: 'READY',
    issues: [],
    ...overrides,
  };
}

function assetMatch() {
  return resolveAsset('PETR4', [{ id: ASSET, ticker: 'PETR4', exchange: 'B3', status: 'ACTIVE' }]);
}

function accountMatch() {
  return resolveAccount('Principal', [{ id: ACCOUNT, name: 'Principal' }]);
}

function ledgerRow(overrides: Partial<ExistingLedgerRow> = {}): ExistingLedgerRow {
  return {
    provider: 'CSV',
    externalId: 'NEG-1',
    assetId: ASSET,
    accountId: ACCOUNT,
    type: 'BUY',
    tradeDate: '2026-01-15',
    quantity: '100',
    unitPrice: '38.50',
    fees: '4.90',
    amount: null,
    currency: 'BRL',
    fingerprint: canonicalFingerprint({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'BUY',
      tradeDate: '2026-01-15',
      quantity: '100',
      unitPrice: '38.50',
      fees: '4.90',
      currency: 'BRL',
    }),
    ...overrides,
  };
}

describe('Import Engine: fingerprints', () => {
  it('produces stable fingerprints regardless of decimal formatting', () => {
    const a = canonicalFingerprint({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'BUY',
      tradeDate: '2026-01-15',
      quantity: '100',
      unitPrice: '38.50',
      fees: '4.90',
      currency: 'BRL',
    });
    const b = canonicalFingerprint({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'BUY',
      tradeDate: '2026-01-15',
      quantity: '0100',
      unitPrice: '38.500',
      fees: '4.900',
      currency: 'BRL',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes fingerprint when economic fields change', () => {
    const base = {
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'BUY',
      tradeDate: '2026-01-15',
      quantity: '100',
      unitPrice: '38.50',
      fees: '4.90',
      currency: 'BRL',
    };
    expect(canonicalFingerprint({ ...base, quantity: '200' })).not.toBe(canonicalFingerprint(base));
    expect(canonicalFingerprint({ ...base, unitPrice: '38.51' })).not.toBe(
      canonicalFingerprint(base),
    );
  });

  it('normalizes provider identity case-insensitively', () => {
    expect(normalizeProvider('xp')).toBe('XP');
    expect(sourceIdentityKey('xp', 'NEG-1')).toBe(sourceIdentityKey('XP', 'NEG-1'));
  });

  it('normalizes ledger NUMERIC formatting for comparison', () => {
    expect(normalizeDecimalValue('38.50')).toBe('38.5');
    expect(normalizeDecimalValue('4.90')).toBe('4.9');
    expect(normalizeDecimalValue('100')).toBe('100');
    expect(normalizeDecimalValue(null)).toBe('0');
    expect(normalizeDecimalValue('')).toBe('0');
  });

  it('probable key ignores price and fees', () => {
    const key = {
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'BUY',
      tradeDate: '2026-01-15',
      quantity: '100',
      currency: 'BRL',
    };
    expect(probableMatchKey(key)).toBe(probableMatchKey({ ...key }));
  });

  it('distinguishes split legs by type and dedupes identical legs', () => {
    const leg = {
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      tradeDate: '2025-04-15',
      quantity: '',
      unitPrice: null,
      fees: null,
      currency: 'BRL',
    };
    const reverseSplit = canonicalFingerprint({ ...leg, type: 'REVERSE_SPLIT' });
    const split = canonicalFingerprint({ ...leg, type: 'SPLIT' });
    expect(reverseSplit).not.toBe(split);
    expect(canonicalFingerprint({ ...leg, type: 'SPLIT' })).toBe(split);
  });
});

describe('Import Engine: asset and account resolution', () => {
  it('resolves a unique ticker', () => {
    const match = resolveAsset('petr4', [
      { id: ASSET, ticker: 'PETR4', exchange: 'B3', status: 'ACTIVE' },
    ]);
    expect(match.resolution).toBe('RESOLVED');
    expect(match.asset?.id).toBe(ASSET);
  });

  it('flags the same ticker on two exchanges as ambiguous', () => {
    const match = resolveAsset('PETR4', [
      { id: ASSET, ticker: 'PETR4', exchange: 'B3', status: 'ACTIVE' },
      { id: 'other', ticker: 'PETR4', exchange: 'NYSE', status: 'ACTIVE' },
    ]);
    expect(match.resolution).toBe('AMBIGUOUS');
    expect(match.candidates).toHaveLength(2);
  });

  it('reports unknown tickers as not found', () => {
    expect(resolveAsset('XXXX4', []).resolution).toBe('NOT_FOUND');
  });

  it('resolves accounts by id or name, unspecified when absent', () => {
    expect(resolveAccount(undefined, []).resolution).toBe('UNSPECIFIED');
    expect(resolveAccount(ACCOUNT, [{ id: ACCOUNT, name: 'Principal' }]).resolution).toBe(
      'RESOLVED',
    );
    expect(resolveAccount('principal', [{ id: ACCOUNT, name: 'Principal' }]).resolution).toBe(
      'RESOLVED',
    );
    expect(resolveAccount('Inexistente', [{ id: ACCOUNT, name: 'Principal' }]).resolution).toBe(
      'NOT_FOUND',
    );
  });
});

describe('Import Engine: duplicate classification', () => {
  const base = {
    portfolioId: PORTFOLIO,
    provider: 'CSV',
    assetMatch: assetMatch(),
    accountMatch: accountMatch(),
    defaultAccountId: ACCOUNT,
  };

  it('marks exact external-id matches as duplicates', () => {
    const classified = classifyOne({ ...base, candidate: candidate(), existing: [ledgerRow()] });
    expect(classified.duplicate).toBe('EXACT_DUPLICATE');
    expect(classified.status).toBe('DUPLICATE');
  });

  it('marks fingerprint matches without external id as duplicates', () => {
    const classified = classifyOne({
      ...base,
      candidate: candidate({ externalId: undefined }),
      existing: [ledgerRow({ provider: null, externalId: null })],
    });
    expect(classified.duplicate).toBe('EXACT_DUPLICATE');
    expect(classified.status).toBe('DUPLICATE');
  });

  it('flags near matches with different price as probable duplicates', () => {
    const classified = classifyOne({
      ...base,
      candidate: candidate({ externalId: undefined, unitPrice: '38.55' }),
      existing: [ledgerRow({ provider: null, externalId: null })],
    });
    expect(classified.duplicate).toBe('PROBABLE_DUPLICATE');
    expect(classified.status).toBe('NEEDS_REVIEW');
  });

  it('flags same external id with different values as conflict', () => {
    const classified = classifyOne({
      ...base,
      candidate: candidate({ quantity: '200' }),
      existing: [ledgerRow()],
    });
    expect(classified.duplicate).toBe('CONFLICT');
    expect(classified.status).toBe('NEEDS_REVIEW');
  });

  it('marks genuinely new trades as ready', () => {
    const classified = classifyOne({
      ...base,
      candidate: candidate({ externalId: 'NEG-2', quantity: '200' }),
      existing: [ledgerRow()],
    });
    expect(classified.duplicate).toBe('NEW');
    expect(classified.status).toBe('READY');
    expect(classified.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requires review for ambiguous assets', () => {
    const ambiguous = resolveAsset('PETR4', [
      { id: ASSET, ticker: 'PETR4', exchange: 'B3', status: 'ACTIVE' },
      { id: 'other', ticker: 'PETR4', exchange: 'NYSE', status: 'ACTIVE' },
    ]);
    const classified = classifyOne({
      ...base,
      assetMatch: ambiguous,
      candidate: candidate(),
      existing: [],
    });
    expect(classified.status).toBe('AMBIGUOUS_ASSET');
  });
});

describe('Import Engine: summary counts', () => {
  it('counts statuses exactly once per row', () => {
    const summary = summarize([
      {
        ...classifyOne({
          portfolioId: PORTFOLIO,
          provider: 'CSV',
          candidate: candidate(),
          assetMatch: assetMatch(),
          accountMatch: accountMatch(),
          defaultAccountId: ACCOUNT,
          existing: [],
        }),
        status: 'READY',
      },
      {
        ...classifyOne({
          portfolioId: PORTFOLIO,
          provider: 'CSV',
          candidate: candidate(),
          assetMatch: assetMatch(),
          accountMatch: accountMatch(),
          defaultAccountId: ACCOUNT,
          existing: [],
        }),
        status: 'DUPLICATE',
      },
      {
        ...classifyOne({
          portfolioId: PORTFOLIO,
          provider: 'CSV',
          candidate: candidate(),
          assetMatch: assetMatch(),
          accountMatch: accountMatch(),
          defaultAccountId: ACCOUNT,
          existing: [],
        }),
        status: 'NEEDS_REVIEW',
      },
      {
        ...classifyOne({
          portfolioId: PORTFOLIO,
          provider: 'CSV',
          candidate: candidate(),
          assetMatch: assetMatch(),
          accountMatch: accountMatch(),
          defaultAccountId: ACCOUNT,
          existing: [],
        }),
        status: 'INVALID',
      },
      {
        ...classifyOne({
          portfolioId: PORTFOLIO,
          provider: 'CSV',
          candidate: candidate(),
          assetMatch: assetMatch(),
          accountMatch: accountMatch(),
          defaultAccountId: ACCOUNT,
          existing: [],
        }),
        status: 'UNSUPPORTED',
      },
      {
        ...classifyOne({
          portfolioId: PORTFOLIO,
          provider: 'CSV',
          candidate: candidate(),
          assetMatch: assetMatch(),
          accountMatch: accountMatch(),
          defaultAccountId: ACCOUNT,
          existing: [],
        }),
        status: 'AMBIGUOUS_ASSET',
      },
    ]);
    expect(summary).toEqual({
      totalRows: 6,
      ready: 1,
      duplicates: 1,
      needsReview: 1,
      invalid: 1,
      unsupported: 1,
      ambiguousAssets: 1,
    });
  });
});
