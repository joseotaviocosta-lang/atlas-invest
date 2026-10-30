import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import { EntityNotFoundError, CrossPortfolioIntegrityError } from '@atlas/database';
import { CorporateActionsUseCase } from '../../apps/api/src/application/transactions/corporate-actions.use-case';

/**
 * Corporate-action batch use-case (mocked repositories, real domain +
 * replay). No DB, no network. Covers validation, preview projection,
 * stale guard, dedupe, atomic single-write and security rejects.
 */
describe('CorporateActionsUseCase (mocked I/O)', () => {
  const PORTFOLIO = '71111111-1111-4111-8111-111111111111';
  const ACCOUNT = '72222222-2222-4222-8222-222222222222';
  const ASSET = '73333333-3333-4333-8333-333333333333';
  const USER = 'user-ca-1';

  const portfolio = { id: PORTFOLIO, userId: USER };
  const account = { id: ACCOUNT, portfolioId: PORTFOLIO };
  const asset = { id: ASSET, ticker: 'VIVT3' };

  function repos(ledger: unknown[] = []) {
    return {
      portfolioRepository: { findById: vi.fn().mockResolvedValue(portfolio) },
      accountRepository: { findById: vi.fn().mockResolvedValue(account) },
      assetRepository: {
        findByIds: vi
          .fn()
          .mockImplementation((ids: string[]) =>
            Promise.resolve(ids.includes(ASSET) ? [asset] : []),
          ),
      },
      transactionRepository: {
        findByPortfolioId: vi.fn().mockResolvedValue(ledger),
        createMany: vi.fn().mockImplementation((txs: unknown[]) => Promise.resolve(txs)),
      },
    };
  }

  function opening() {
    return TransactionFactory.createTransfer({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'TRANSFER_IN',
      quantity: '200',
      currency: 'BRL',
      tradeDate: '2024-12-31',
    });
  }

  function pairCommand() {
    return {
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      userId: USER,
      currency: 'BRL',
      legs: [
        {
          assetId: ASSET,
          type: 'REVERSE_SPLIT' as const,
          tradeDate: '2025-04-15',
          factor: '40',
          notes: 'Telefônica Brasil — grupamento 40:1, efeitos em 15/04/2025.',
        },
        {
          assetId: ASSET,
          type: 'SPLIT' as const,
          tradeDate: '2025-04-15',
          factor: '80',
          notes: 'Telefônica Brasil — desdobramento 1:80, efeitos em 15/04/2025.',
        },
      ],
    };
  }

  let r: ReturnType<typeof repos>;
  let useCase: CorporateActionsUseCase;
  beforeEach(() => {
    r = repos([opening()]);
    useCase = new CorporateActionsUseCase(
      r.transactionRepository as never,
      r.portfolioRepository as never,
      r.accountRepository as never,
      r.assetRepository as never,
    );
  });

  it('previews the VIVT3 pair sequentially: 200 → 5 → 400, INCOMPLETE, no warning', async () => {
    const preview = await useCase.preview(pairCommand());
    expect(preview.readyCount).toBe(2);
    expect(preview.legs).toHaveLength(2);
    expect(preview.legs[0]).toMatchObject({
      type: 'REVERSE_SPLIT',
      status: 'READY',
      beforeQuantity: '200',
      afterQuantity: '5',
      costBasisStatus: 'INCOMPLETE',
      fractionWarning: null,
    });
    expect(preview.legs[1]).toMatchObject({
      type: 'SPLIT',
      status: 'READY',
      beforeQuantity: '5',
      afterQuantity: '400',
    });
    expect(preview.projectedQuantities).toEqual([
      { assetId: ASSET, assetTicker: 'VIVT3', beforeQuantity: '200', afterQuantity: '400' },
    ]);
    expect(preview.costBasisStatus).toBe('INCOMPLETE');
    expect(preview.taxMessage).toContain('não gera venda');
    expect(preview.ledgerFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('confirms atomically in one write with deterministic staged order', async () => {
    const preview = await useCase.preview(pairCommand());
    const created = await useCase.confirm({
      ...pairCommand(),
      expectedLedgerFingerprint: preview.ledgerFingerprint,
    });
    expect(r.transactionRepository.createMany).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(2);
    expect(created.map((tx) => tx.type)).toEqual(['REVERSE_SPLIT', 'SPLIT']);
    const [first, second] = created.map((tx) => tx.createdAt.getTime());
    expect(second).toBeGreaterThan(first!);
    expect(created.every((tx) => tx.provider === 'MANUAL')).toBe(true);
  });

  it('rejects stale previews without writing', async () => {
    const preview = await useCase.preview(pairCommand());
    await expect(
      useCase.confirm({
        ...pairCommand(),
        expectedLedgerFingerprint: `${preview.ledgerFingerprint}x`,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(r.transactionRepository.createMany).not.toHaveBeenCalled();
  });

  it('rejects duplicates without writing', async () => {
    const existing = TransactionFactory.createSplit({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      type: 'REVERSE_SPLIT',
      factor: '40',
      currency: 'BRL',
      tradeDate: '2025-04-15',
    });
    const withDup = repos([opening(), existing]);
    const useCase2 = new CorporateActionsUseCase(
      withDup.transactionRepository as never,
      withDup.portfolioRepository as never,
      withDup.accountRepository as never,
      withDup.assetRepository as never,
    );
    const preview = await useCase2.preview(pairCommand());
    expect(preview.legs[0]!.status).toBe('DUPLICATE');
    expect(preview.readyCount).toBe(1);
    await expect(
      useCase2.confirm({ ...pairCommand(), expectedLedgerFingerprint: preview.ledgerFingerprint }),
    ).rejects.toMatchObject({ status: 409 });
    expect(withDup.transactionRepository.createMany).not.toHaveBeenCalled();
  });

  it('validates everything before any write (invalid second leg writes nothing)', async () => {
    const preview = await useCase.preview(pairCommand());
    const bad = {
      ...pairCommand(),
      expectedLedgerFingerprint: preview.ledgerFingerprint,
      legs: [pairCommand().legs[0]!, { ...pairCommand().legs[1]!, factor: '1' }],
    };
    await expect(useCase.confirm(bad)).rejects.toThrow();
    expect(r.transactionRepository.createMany).not.toHaveBeenCalled();
  });

  it('rejects unsupported types, bad factors, bad dates and missing evidence', async () => {
    const base = pairCommand();
    await expect(
      useCase.preview({ ...base, legs: [{ ...base.legs[0]!, type: 'BONUS' as never }] }),
    ).rejects.toThrow(/Only SPLIT and REVERSE_SPLIT/);
    for (const factor of ['0', '-40']) {
      await expect(
        useCase.preview({ ...base, legs: [{ ...base.legs[0]!, factor }] }),
      ).rejects.toThrow();
    }
    await expect(
      useCase.preview({ ...base, legs: [{ ...base.legs[0]!, factor: '1' }] }),
    ).rejects.toThrow();
    await expect(
      useCase.preview({ ...base, legs: [{ ...base.legs[0]!, tradeDate: '15/04/2025' }] }),
    ).rejects.toThrow();
    await expect(
      useCase.preview({ ...base, legs: [{ ...base.legs[0]!, notes: '  ' }] }),
    ).rejects.toThrow(/Evidence notes are required/);
    await expect(useCase.preview({ ...base, legs: [] })).rejects.toThrow(/At least one/);
  });

  it('enforces ownership and isolation (404/409, never cross-portfolio)', async () => {
    const foreign = repos([opening()]);
    foreign.portfolioRepository.findById.mockResolvedValue({ id: PORTFOLIO, userId: 'other' });
    const useCase2 = new CorporateActionsUseCase(
      foreign.transactionRepository as never,
      foreign.portfolioRepository as never,
      foreign.accountRepository as never,
      foreign.assetRepository as never,
    );
    await expect(useCase2.preview(pairCommand())).rejects.toBeInstanceOf(EntityNotFoundError);
    const cross = repos([opening()]);
    cross.accountRepository.findById.mockResolvedValue({ id: ACCOUNT, portfolioId: 'other-pf' });
    const useCase3 = new CorporateActionsUseCase(
      cross.transactionRepository as never,
      cross.portfolioRepository as never,
      cross.accountRepository as never,
      cross.assetRepository as never,
    );
    await expect(useCase3.preview(pairCommand())).rejects.toBeInstanceOf(
      CrossPortfolioIntegrityError,
    );
  });

  it('warns on fractional reverse splits and preserves KNOWN cost invariant', async () => {
    const withBuy = repos([
      TransactionFactory.createBuy({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '90',
        unitPrice: '10.00',
        currency: 'BRL',
        tradeDate: '2024-12-31',
      }),
    ]);
    const useCase2 = new CorporateActionsUseCase(
      withBuy.transactionRepository as never,
      withBuy.portfolioRepository as never,
      withBuy.accountRepository as never,
      withBuy.assetRepository as never,
    );
    const preview = await useCase2.preview({
      ...pairCommand(),
      legs: [
        {
          assetId: ASSET,
          type: 'REVERSE_SPLIT',
          tradeDate: '2025-04-15',
          factor: '40',
          notes: 'fracionário',
        },
      ],
    });
    expect(preview.legs[0]!.afterQuantity).toBe('2.25');
    expect(preview.legs[0]!.fractionWarning).toContain('fracionária');
    expect(preview.legs[0]!.status).toBe('READY');
  });
});
