import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmPortfolioImportUseCase } from '../../apps/api/src/application/imports';
import type { ClassifiedCandidate } from '@atlas/import-engine';

/**
 * PART M — typed unsettled-trade resolution at the REAL confirm boundary
 * (stubbed preview/create I/O, production decision loop + builder).
 * A manipulated client can never promote a row: eligibility and metadata are
 * re-verified server-side against the recomputed preview.
 */
describe('Confirm: pre-baseline unsettled-trade resolution security', () => {
  const PORTFOLIO = '61111111-1111-4111-8111-111111111111';
  const ACCOUNT = '62222222-2222-4222-8222-222222222222';
  const ASSET = '63333333-3333-4333-8333-333333333333';

  function gatedBuy(overrides: Partial<ClassifiedCandidate> = {}): ClassifiedCandidate {
    return {
      rowNumber: 61,
      tradeDate: '2024-12-27',
      ticker: 'KCRE11',
      operation: 'BUY',
      rawOperation: 'Compra',
      quantity: '80',
      unitPrice: '8.45',
      fees: '0',
      currency: 'BRL',
      status: 'NEEDS_REVIEW',
      issues: [
        {
          code: 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT',
          message: 'coberto pelo snapshot',
        },
      ],
      assetId: ASSET,
      assetResolution: 'RESOLVED',
      targetAssetId: null,
      targetAssetResolution: 'NOT_FOUND',
      unsettledExceptionEligible: true,
      coveringSnapshotDate: '2024-12-31',
      accountId: ACCOUNT,
      accountResolution: 'RESOLVED',
      fingerprint: 'fp-kcre27',
      duplicate: 'NEW',
      provider: 'B3',
      ...overrides,
    } as ClassifiedCandidate;
  }

  function harness(candidates: ClassifiedCandidate[]) {
    const preview = {
      execute: vi.fn(),
      executeWithOverrides: vi.fn().mockResolvedValue({
        sourceType: 'B3_NEGOTIATION_XLSX',
        provider: 'B3',
        fileName: 'negociacao-full.xlsx',
        candidates,
        summary: {
          totalRows: candidates.length,
          ready: 0,
          duplicates: 0,
          needsReview: candidates.length,
          invalid: 0,
          unsupported: 0,
          ambiguousAssets: 0,
        },
      }),
    };
    const captured: unknown[][] = [];
    const createTransaction = {
      execute: vi.fn(),
      executeMany: vi.fn().mockImplementation((commands: unknown[]) => {
        captured.push(commands);
        return Promise.resolve(commands.map((_, index) => ({ id: `tx-${index}` })));
      }),
    };
    const useCase = new ConfirmPortfolioImportUseCase(preview as never, createTransaction as never);
    return { useCase, createTransaction, captured };
  }

  const baseCommand = {
    portfolioId: PORTFOLIO,
    userId: 'user-kcre',
    sourceType: 'B3_NEGOTIATION_XLSX' as const,
    provider: 'B3',
    fileName: 'negociacao-full.xlsx',
    content: 'xlsx',
  };

  const resolution = {
    type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT' as const,
    reason: 'Trade 27/12/2024 settled after 31/12/2024 B3 custody cutoff (02/01/2025)',
    declaredSettlementDate: '2025-01-02',
  };

  it('persists an eligible gated BUY with resolution, preserving trade-date economics', async () => {
    const { useCase, createTransaction, captured } = harness([gatedBuy()]);
    const receipt = await useCase.execute({
      ...baseCommand,
      decisions: [{ rowNumber: 61, action: 'import', resolution }],
    });
    expect(receipt.created).toBe(1);
    expect(receipt.errorCount).toBe(0);
    expect(createTransaction.executeMany).toHaveBeenCalledTimes(1);
    const [command] = captured[0] as Array<Record<string, unknown>>;
    expect(command).toMatchObject({
      type: 'BUY',
      quantity: '80',
      unitPrice: '8.45',
      tradeDate: '2024-12-27',
    });
    expect(String(command!.notes)).toContain('PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT');
    expect(String(command!.notes)).toContain('2024-12-31');
    expect(String(command!.notes)).toContain('2025-01-02');
  });

  it('leaves the same row pending when no resolution is sent (writer not called)', async () => {
    const { useCase, createTransaction } = harness([gatedBuy()]);
    const receipt = await useCase.execute({
      ...baseCommand,
      decisions: [{ rowNumber: 61, action: 'import' }],
    });
    expect(receipt.created).toBe(0);
    expect(receipt.pendingReviewCount).toBe(1);
    expect(receipt.errorCount).toBe(0);
    expect(createTransaction.executeMany).not.toHaveBeenCalled();
  });

  it('rejects forged resolutions on ineligible rows without writing', async () => {
    const otherBlocker = gatedBuy({
      rowNumber: 61,
      issues: [
        { code: 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT', message: 'x' },
        { code: 'TRANSFER_WITH_PRICE', message: 'y' },
      ],
    });
    const emptyReason = gatedBuy({ rowNumber: 62 });
    const unknownType = gatedBuy({ rowNumber: 63 });
    const { useCase, createTransaction } = harness([otherBlocker, emptyReason, unknownType]);
    const receipt = await useCase.execute({
      ...baseCommand,
      decisions: [
        { rowNumber: 61, action: 'import', resolution },
        { rowNumber: 62, action: 'import', resolution: { ...resolution, reason: '  ' } },
        {
          rowNumber: 63,
          action: 'import',
          resolution: { ...resolution, type: 'FORCE_IMPORT' as never },
        },
      ],
    });
    expect(receipt.created).toBe(0);
    expect(createTransaction.executeMany).not.toHaveBeenCalled();
    expect(receipt.errorCount).toBe(3);
  });
});
