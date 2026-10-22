import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmPortfolioImportUseCase } from '../../apps/api/src/application/imports';
import type { ClassifiedCandidate } from '@atlas/import-engine';

/**
 * Phase 5M — confirm-path wiring (5L pendency #1) against the REAL
 * `ConfirmPortfolioImportUseCase`: transfer legs keep `transferGroupId`,
 * B3 rows record source `B3`, duplicates stay skipped. Phase 5O-A: income
 * rows persist value-only through the canonical income path. Persistence is
 * stubbed; the decision loop and command builder under test are production
 * code (same path the HTTP confirm endpoint drives).
 */
describe('Phase 5M: confirm wiring for B3 transfers (real use-case, stubbed I/O)', () => {
  const PORTFOLIO = '51111111-1111-4111-8111-111111111111';
  const ACCOUNT_A = '52222222-2222-4222-8222-222222222222';
  const ACCOUNT_B = '53333333-3333-4333-8333-333333333333';
  const ASSET = '54444444-4444-4334-8333-444444444444';

  function candidate(overrides: Partial<ClassifiedCandidate>): ClassifiedCandidate {
    return {
      rowNumber: 2,
      tradeDate: '2026-05-02',
      ticker: 'PETR4',
      operation: 'TRANSFER_OUT',
      rawOperation: 'TRANSFERENCIA_SAIDA',
      quantity: '70',
      unitPrice: '0',
      fees: '0',
      currency: 'BRL',
      accountLabel: 'CONTA SINTETICA 5M-A',
      externalId: 'B3-5M-0008-OUT',
      transferGroupId: 'B3-5M-TRF-001',
      status: 'READY',
      issues: [],
      assetId: ASSET,
      assetResolution: 'RESOLVED',
      accountId: ACCOUNT_A,
      accountResolution: 'RESOLVED',
      fingerprint: 'f'.repeat(64),
      duplicate: 'NEW',
      provider: 'B3',
      ...overrides,
    } as ClassifiedCandidate;
  }

  function harness(candidates: ClassifiedCandidate[]) {
    const preview = {
      execute: vi.fn(),
      executeWithOverrides: vi.fn().mockResolvedValue({
        sourceType: 'GENERIC_CSV',
        provider: 'B3',
        fileName: 'b3-simulated.csv',
        candidates,
        summary: {
          totalRows: candidates.length,
          ready: candidates.length,
          duplicates: 0,
          needsReview: 0,
          invalid: 0,
          unsupported: 0,
          ambiguousAssets: 0,
        },
      }),
    };
    const created: Array<{ id: string }> = [];
    const captured: unknown[][] = [];
    const createTransaction = {
      execute: vi.fn(),
      executeMany: vi.fn().mockImplementation((commands: unknown[]) => {
        captured.push(commands);
        const rows = commands.map((_, index) => ({ id: `tx-${captured.length}-${index}` }));
        created.push(...rows);
        return Promise.resolve(rows);
      }),
    };
    const useCase = new ConfirmPortfolioImportUseCase(preview as never, createTransaction as never);
    return { useCase, preview, createTransaction, captured };
  }

  function command(rowNumber: number, action: 'import' | 'skip' = 'import') {
    return { rowNumber, action };
  }

  it('persists mirrored transfer legs with the shared transferGroupId via executeMany', async () => {
    const outLeg = candidate({});
    const inLeg = candidate({
      rowNumber: 3,
      operation: 'TRANSFER_IN',
      rawOperation: 'TRANSFERENCIA_ENTRADA',
      externalId: 'B3-5M-0008-IN',
      accountLabel: 'CONTA SINTETICA 5M-B',
      accountId: ACCOUNT_B,
    });
    const { useCase, createTransaction, captured } = harness([outLeg, inLeg]);
    const receipt = await useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [command(2), command(3)],
    });
    expect(receipt.created).toBe(2);
    expect(createTransaction.executeMany).toHaveBeenCalledTimes(1);
    expect(captured[0]).toHaveLength(2);
    const [outCommand, inCommand] = captured[0] as Array<Record<string, unknown>>;
    expect(outCommand).toMatchObject({
      type: 'TRANSFER_OUT',
      source: 'B3',
      provider: 'B3',
      externalId: 'B3-5M-0008-OUT',
      transferGroupId: 'B3-5M-TRF-001',
      quantity: '70',
    });
    expect(inCommand).toMatchObject({
      type: 'TRANSFER_IN',
      source: 'B3',
      provider: 'B3',
      externalId: 'B3-5M-0008-IN',
      transferGroupId: 'B3-5M-TRF-001',
      quantity: '70',
    });
    expect(outCommand).not.toHaveProperty('unitPrice');
  });

  it('records source B3 for B3 trades and CSV otherwise', async () => {
    const buy = candidate({
      operation: 'BUY',
      rawOperation: 'COMPRA',
      quantity: '100',
      unitPrice: '30.00',
      externalId: 'B3-5M-0001',
      transferGroupId: undefined,
      tradeDate: '2026-03-10',
    });
    const { useCase, captured } = harness([buy]);
    await useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [command(2)],
    });
    expect((captured[0]![0] as Record<string, unknown>).source).toBe('B3');

    const csvBuy = candidate({ provider: 'CSV', externalId: 'NEG-1', transferGroupId: undefined });
    const csvHarness = harness([csvBuy]);
    await csvHarness.useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'CSV',
      fileName: 'broker.csv',
      content: 'csv',
      decisions: [command(2)],
    });
    expect((csvHarness.captured[0]![0] as Record<string, unknown>).source).toBe('CSV');
  });

  it('persists income events value-only through the canonical income path', async () => {
    const dividend = candidate({
      operation: 'DIVIDEND',
      rawOperation: 'DIVIDENDO',
      quantity: '100',
      amount: '87.30',
      externalId: 'B3-5M-0004',
      transferGroupId: undefined,
      tradeDate: '2026-04-15',
    });
    const { useCase, createTransaction, captured } = harness([dividend]);
    const receipt = await useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [command(2)],
    });
    expect(receipt.created).toBe(1);
    expect(createTransaction.executeMany).toHaveBeenCalledTimes(1);
    expect(captured[0]).toHaveLength(1);
    const incomeCommand = captured[0]![0] as Record<string, unknown>;
    expect(incomeCommand).toMatchObject({
      type: 'DIVIDEND',
      source: 'B3',
      provider: 'B3',
      externalId: 'B3-5M-0004',
      amount: '87.30',
    });
    // Value-only: no quantity, no price, no fees, no invented withholding.
    expect(incomeCommand).not.toHaveProperty('quantity');
    expect(incomeCommand).not.toHaveProperty('unitPrice');
    expect(incomeCommand).not.toHaveProperty('fees');
    expect(incomeCommand).not.toHaveProperty('taxes');
  });

  it('income rows without an exact amount are never written', async () => {
    const amountless = candidate({
      operation: 'DIVIDEND',
      rawOperation: 'DIVIDENDO',
      amount: undefined,
      externalId: 'B3-5M-0099',
      transferGroupId: undefined,
      tradeDate: '2026-04-15',
    });
    const { useCase, createTransaction } = harness([amountless]);
    const receipt = await useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [command(2)],
    });
    expect(receipt.created).toBe(0);
    expect(createTransaction.executeMany).not.toHaveBeenCalled();
  });

  it('skips exact duplicates and requires explicit decisions for probable ones', async () => {
    const duplicate = candidate({ duplicate: 'EXACT_DUPLICATE', status: 'DUPLICATE' });
    const { useCase, createTransaction } = harness([duplicate]);
    const receipt = await useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [command(2)],
    });
    expect(receipt.created).toBe(0);
    expect(receipt.skippedDuplicates).toBe(1);
    expect(createTransaction.executeMany).not.toHaveBeenCalled();

    const probable = candidate({ duplicate: 'PROBABLE_DUPLICATE', status: 'NEEDS_REVIEW' });
    const unforced = harness([probable]);
    const unforcedReceipt = await unforced.useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [],
    });
    expect(unforcedReceipt.created).toBe(0);
    expect(unforced.createTransaction.executeMany).not.toHaveBeenCalled();

    const forced = harness([
      candidate({ duplicate: 'PROBABLE_DUPLICATE', status: 'NEEDS_REVIEW' }),
    ]);
    const forcedReceipt = await forced.useCase.execute({
      portfolioId: PORTFOLIO,
      userId: 'user-5m',
      sourceType: 'GENERIC_CSV',
      provider: 'B3',
      fileName: 'b3-simulated.csv',
      content: 'csv',
      decisions: [command(2, 'import')],
    });
    expect(forcedReceipt.created).toBe(1);
    expect(forced.createTransaction.executeMany).toHaveBeenCalledTimes(1);
  });
});
