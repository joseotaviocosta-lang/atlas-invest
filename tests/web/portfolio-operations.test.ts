import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '@/api/client';
import {
  normalizeDecimalInput,
  isPositiveDecimalString,
  isNonNegativeDecimalString,
  CIVIL_DATE_RE,
  OPERATION_TYPE_LABELS,
  moneyAmountOf,
  assetOptionLabel,
} from '@/lib/operation-entry';

describe('Web: Manual Operation Entry (H5 first-transaction flow)', () => {
  const portfolioId = 'c0000000-0000-4000-8000-000000000001';
  const accountXp = 'd0000000-0000-4000-8000-000000000001';
  const assetPetr4 = 'e0000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes Brazilian comma decimals to canonical dot strings without float math', () => {
    expect(normalizeDecimalInput('30,00')).toBe('30.00');
    expect(normalizeDecimalInput(' 10 ')).toBe('10');
    expect(normalizeDecimalInput('4.90')).toBe('4.90');
  });

  it('accepts positive quantities and rejects zero/negative/garbage (string-only)', () => {
    expect(isPositiveDecimalString('10')).toBe(true);
    expect(isPositiveDecimalString('30.00')).toBe(true);
    expect(isPositiveDecimalString('0')).toBe(false);
    expect(isPositiveDecimalString('0.00')).toBe(false);
    expect(isPositiveDecimalString('')).toBe(false);
    expect(isPositiveDecimalString('-5')).toBe(false);
    expect(isPositiveDecimalString('abc')).toBe(false);
    expect(isNonNegativeDecimalString('0.00')).toBe(true);
    expect(isNonNegativeDecimalString('4.90')).toBe(true);
  });

  it('maps internal operation types to Portuguese labels (never raw enums)', () => {
    expect(OPERATION_TYPE_LABELS.BUY).toBe('Compra');
    expect(OPERATION_TYPE_LABELS.SELL).toBe('Venda');
  });

  it('displays exact server money strings without computing', () => {
    expect(moneyAmountOf({ amount: '30.00', currency: 'BRL' })).toBe('30.00');
    expect(moneyAmountOf('100')).toBe('100');
    expect(moneyAmountOf(undefined)).toBe('—');
  });

  it('labels assets human-readably without exposing AssetId alone', () => {
    expect(assetOptionLabel('PETR4', 'Petrobras PN')).toBe('PETR4 — Petrobras PN');
  });

  it('validates civil dates in strict YYYY-MM-DD form', () => {
    expect(CIVIL_DATE_RE.test('2026-01-05')).toBe(true);
    expect(CIVIL_DATE_RE.test('05/01/2026')).toBe(false);
    expect(CIVIL_DATE_RE.test('')).toBe(false);
  });

  it('submits BUY with canonical decimal strings scoped to the active portfolio', async () => {
    const created = {
      id: 'f0000000-0000-4000-8000-000000000010',
      portfolioId,
      accountId: accountXp,
      type: 'BUY',
      currency: 'BRL',
      tradeDate: '2026-01-05',
      assetId: assetPetr4,
      quantity: '10',
      unitPrice: { amount: '30.00', currency: 'BRL' },
      source: 'MANUAL',
    };

    const calls: Array<{ url: string; body: unknown }> = [];
    global.fetch = vi.fn().mockImplementation(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: created }),
      };
    }) as unknown as typeof fetch;

    const res = await apiClient.post<{ data: typeof created }>(
      `/api/v1/portfolios/${portfolioId}/transactions`,
      {
        accountId: accountXp,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-01-05',
        assetId: assetPetr4,
        quantity: normalizeDecimalInput('10'),
        unitPrice: normalizeDecimalInput('30,00'),
        source: 'MANUAL',
      },
    );

    // Portfolio association is automatic via the URL (no manual portfolioId field)
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(`/api/v1/portfolios/${portfolioId}/transactions`);
    expect(calls[0]!.body).toEqual({
      accountId: accountXp,
      type: 'BUY',
      currency: 'BRL',
      tradeDate: '2026-01-05',
      assetId: assetPetr4,
      quantity: '10',
      unitPrice: '30.00',
      source: 'MANUAL',
    });
    expect(res.data.id).toBe(created.id);
  });

  it('surfaces cross-user portfolio rejection as a visible error (no silent failure)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({
        statusCode: 404,
        error: 'Not Found',
        code: 'TRANSACTION.PORTFOLIO_NOT_FOUND',
        message: 'Portfolio not found.',
      }),
    }) as unknown as typeof fetch;

    await expect(
      apiClient.post(`/api/v1/portfolios/${portfolioId}/transactions`, {
        accountId: accountXp,
        type: 'BUY',
        currency: 'BRL',
        tradeDate: '2026-01-05',
        assetId: assetPetr4,
        quantity: '10',
        unitPrice: '30.00',
        source: 'MANUAL',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('submits manual income (DIVIDEND) with exact decimal amount and no floats', async () => {
    const createdIncome = {
      id: 'f0000000-0000-4000-8000-000000000020',
      portfolioId,
      accountId: accountXp,
      type: 'DIVIDEND',
      currency: 'BRL',
      tradeDate: '2026-02-15',
      assetId: assetPetr4,
      amount: { amount: '45.50', currency: 'BRL' },
      source: 'MANUAL',
    };

    const calls: Array<{ url: string; body: unknown }> = [];
    global.fetch = vi.fn().mockImplementation(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: createdIncome }),
      };
    }) as unknown as typeof fetch;

    const res = await apiClient.post<{ data: typeof createdIncome }>(
      `/api/v1/portfolios/${portfolioId}/transactions`,
      {
        accountId: accountXp,
        type: 'DIVIDEND',
        currency: 'BRL',
        tradeDate: '2026-02-15',
        assetId: assetPetr4,
        amount: normalizeDecimalInput('45,50'),
        source: 'MANUAL',
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      accountId: accountXp,
      type: 'DIVIDEND',
      currency: 'BRL',
      tradeDate: '2026-02-15',
      assetId: assetPetr4,
      amount: '45.50',
      source: 'MANUAL',
    });
    expect(res.data.id).toBe(createdIncome.id);
  });

  it('builds an append-only compensating reversal entry for a BUY', async () => {
    const originalTx = {
      id: 'f0000000-0000-4000-8000-000000000010',
      type: 'BUY',
      tradeDate: '2026-01-05',
      currency: 'BRL',
      accountId: accountXp,
      assetId: assetPetr4,
      quantity: '10',
      unitPrice: '30.00',
    };

    const compensatingCreated = {
      id: 'f0000000-0000-4000-8000-000000000099',
      portfolioId,
      accountId: accountXp,
      type: 'SELL',
      currency: 'BRL',
      tradeDate: '2026-01-05',
      assetId: assetPetr4,
      quantity: '10',
      unitPrice: { amount: '30.00', currency: 'BRL' },
      notes: `[COMPENSAÇÃO ref ${originalTx.id}] Quantidade informada incorretamente`,
      source: 'MANUAL',
    };

    const calls: Array<{ url: string; body: unknown }> = [];
    global.fetch = vi.fn().mockImplementation(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: compensatingCreated }),
      };
    }) as unknown as typeof fetch;

    const res = await apiClient.post<{ data: typeof compensatingCreated }>(
      `/api/v1/portfolios/${portfolioId}/transactions`,
      {
        accountId: originalTx.accountId,
        type: 'SELL',
        currency: originalTx.currency,
        tradeDate: originalTx.tradeDate,
        assetId: originalTx.assetId,
        quantity: originalTx.quantity,
        unitPrice: originalTx.unitPrice,
        notes: `[COMPENSAÇÃO ref ${originalTx.id}] Quantidade informada incorretamente`,
        source: 'MANUAL',
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({
      accountId: accountXp,
      type: 'SELL',
      currency: 'BRL',
      tradeDate: '2026-01-05',
      assetId: assetPetr4,
      quantity: '10',
      unitPrice: '30.00',
      notes: `[COMPENSAÇÃO ref ${originalTx.id}] Quantidade informada incorretamente`,
      source: 'MANUAL',
    });
    expect(res.data.id).toBe(compensatingCreated.id);
  });
});
