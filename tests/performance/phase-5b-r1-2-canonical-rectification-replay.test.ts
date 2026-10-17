import { describe, it, expect, beforeEach } from 'vitest';
import {
  Transaction,
  TransactionFactory,
  Money,
  Currency,
  LocalDate,
  createAssetId,
  createPortfolioId,
  createAccountId,
  createTransactionId,
  Portfolio,
  Account,
  Asset,
} from '@atlas/domain';
import {
  ITransactionRepository,
  IPortfolioRepository,
  IAccountRepository,
  IAssetRepository,
} from '@atlas/database';
import {
  replayPortfolio,
  replayPortfolioTimeline,
  derivePerformanceAssetUniverse,
} from '@atlas/portfolio-engine';
import { valuePosition, ValuationQuote } from '@atlas/valuation-engine';
import { RectifyPortfolioTransactionUseCase } from '../../apps/api/src/application/transactions/rectify-portfolio-transaction.use-case';

const BRL: Currency = 'BRL' as Currency;
const USER_ID = '50000000-0000-4000-8000-000000000001';
const PORTFOLIO_ID = createPortfolioId('30000000-0000-4000-8000-000000000001');
const ACCOUNT_ID = createAccountId('40000000-0000-4000-8000-000000000001');
const ASSET_PETR4 = createAssetId('11111111-1111-4111-8111-111111111111');
const ASSET_VALE3 = createAssetId('22222222-2222-4222-8222-222222222222');

class MockTransactionRepository implements Partial<ITransactionRepository> {
  public transactions: Transaction[] = [];

  async findById(id: string): Promise<Transaction | null> {
    return this.transactions.find((t) => String(t.id) === id) ?? null;
  }

  async findByExternalId(
    portfolioId: string,
    provider: string,
    externalId: string,
  ): Promise<Transaction | null> {
    return (
      this.transactions.find(
        (t) =>
          String(t.portfolioId) === portfolioId &&
          t.provider === provider &&
          t.externalId === externalId,
      ) ?? null
    );
  }

  async findByPortfolioId(
    portfolioId: string,
    options?: { endDate?: LocalDate },
  ): Promise<Transaction[]> {
    let list = this.transactions.filter((t) => String(t.portfolioId) === portfolioId);
    if (options?.endDate) {
      list = list.filter((t) => t.tradeDate.compare(options.endDate!) <= 0);
    }
    return list;
  }

  async createMany(txs: Transaction[]): Promise<Transaction[]> {
    this.transactions.push(...txs);
    return txs;
  }
}

class MockPortfolioRepository implements Partial<IPortfolioRepository> {
  async findById(id: string): Promise<Portfolio | null> {
    if (id === String(PORTFOLIO_ID)) {
      return { id: String(PORTFOLIO_ID), userId: USER_ID } as unknown as Portfolio;
    }
    return null;
  }
}

class MockAccountRepository implements Partial<IAccountRepository> {
  async findById(id: string): Promise<Account | null> {
    if (id === String(ACCOUNT_ID)) {
      return { id: String(ACCOUNT_ID), portfolioId: String(PORTFOLIO_ID) } as unknown as Account;
    }
    return null;
  }
}

class MockAssetRepository implements Partial<IAssetRepository> {
  async findById(id: string): Promise<Asset | null> {
    if (id === String(ASSET_PETR4)) {
      return {
        id: String(ASSET_PETR4),
        ticker: 'PETR4',
        exchange: 'BVMF',
        currency: 'BRL',
      } as unknown as Asset;
    }
    if (id === String(ASSET_VALE3)) {
      return {
        id: String(ASSET_VALE3),
        ticker: 'VALE3',
        exchange: 'BVMF',
        currency: 'BRL',
      } as unknown as Asset;
    }
    return null;
  }
}

describe('Phase 5B-R1.2: Canonical Append-Only Rectification Replay Proof', () => {
  let txRepo: MockTransactionRepository;
  let portfolioRepo: MockPortfolioRepository;
  let accountRepo: MockAccountRepository;
  let assetRepo: MockAssetRepository;
  let useCase: RectifyPortfolioTransactionUseCase;

  beforeEach(() => {
    txRepo = new MockTransactionRepository();
    portfolioRepo = new MockPortfolioRepository();
    accountRepo = new MockAccountRepository();
    assetRepo = new MockAssetRepository();
    useCase = new RectifyPortfolioTransactionUseCase(
      txRepo as unknown as ITransactionRepository,
      portfolioRepo as unknown as IPortfolioRepository,
      accountRepo as unknown as IAccountRepository,
      assetRepo as unknown as IAssetRepository,
    );
  });

  // =========================================================================
  // Case 1: RECTIFY Mode — Quantity & Price Correction
  // =========================================================================
  it('Case 1: RectifyTransactionUseCase (mode: RECTIFY) generates linked compensation and replacement, preserving ledger immutability and producing exact derived custody', async () => {
    // 1. Initial BUY transaction: 100 PETR4 @ R$ 50.00 on 2026-01-10
    const originalBuy = TransactionFactory.createBuy({
      id: createTransactionId('b0000000-0000-4000-8000-000000000001'),
      portfolioId: PORTFOLIO_ID,
      accountId: ACCOUNT_ID,
      assetId: ASSET_PETR4,
      tradeDate: '2026-01-10',
      quantity: '100',
      unitPrice: '50.00',
      fees: '0.00',
      taxes: '0.00',
      currency: BRL,
      source: 'MANUAL',
      createdAt: new Date('2026-01-10T10:00:00.000Z'),
      updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    });
    txRepo.transactions.push(originalBuy);

    // Snapshot of original transaction before rectification
    const originalQtyBefore = originalBuy.quantity.toString();
    const originalPriceBefore = originalBuy.unitPrice.amount;
    const originalIsFrozen = Object.isFrozen(originalBuy);

    // 2. Execute canonical rectification use case:
    // User bought 120 shares @ 40.00, not 100 @ 50.00
    const result = await useCase.execute({
      portfolioId: String(PORTFOLIO_ID),
      originalTransactionId: String(originalBuy.id),
      mode: 'RECTIFY',
      reason: 'Erro de digitacao na corretagem',
      idempotencyKey: 'idemp-rectify-case-1',
      replacement: {
        type: 'BUY',
        quantity: '120',
        unitPrice: '40.00',
        fees: '0.00',
        tradeDate: '2026-01-10',
      },
      userId: USER_ID,
    });

    expect(result.isIdempotentReplay).toBe(false);
    expect(result.mode).toBe('RECTIFY');

    // 3. Verify ledger invariants:
    // Total transactions in ledger = 3 (original + compensating + replacement)
    expect(txRepo.transactions.length).toBe(3);

    const compTx = result.compensatingTransaction;
    const replTx = result.replacementTransaction!;
    expect(compTx).toBeDefined();
    expect(replTx).toBeDefined();

    // Verify compensating transaction properties
    expect(compTx.type).toBe('SELL');
    expect(compTx.quantity.toString()).toBe('100');
    expect(compTx.unitPrice.equals(Money.from('50.00', BRL))).toBe(true);
    expect(compTx.notes).toContain(`[COMPENSAÇÃO ref ${originalBuy.id}] Estorno para retificação`);
    expect(compTx.provider).toBe('ATLAS_RECTIFY');
    expect(compTx.externalId).toBe(`reversal:${originalBuy.id}:idemp-rectify-case-1`);

    // Verify replacement transaction properties
    expect(replTx.type).toBe('BUY');
    expect(replTx.quantity.toString()).toBe('120');
    expect(replTx.unitPrice.equals(Money.from('40.00', BRL))).toBe(true);
    expect(replTx.notes).toContain(
      `[CORREÇÃO ref ${originalBuy.id}] Erro de digitacao na corretagem`,
    );
    expect(replTx.provider).toBe('ATLAS_RECTIFY');
    expect(replTx.externalId).toBe(`replacement:${originalBuy.id}:idemp-rectify-case-1`);

    // Invariant: Original transaction row was NEVER mutated or deleted
    expect(txRepo.transactions[0].id).toBe(originalBuy.id);
    expect(txRepo.transactions[0].quantity.toString()).toBe(originalQtyBefore);
    expect(txRepo.transactions[0].unitPrice.amount).toBe(originalPriceBefore);
    expect(Object.isFrozen(txRepo.transactions[0])).toBe(originalIsFrozen);

    // 4. Historical Portfolio Replay Verification:
    // A) Before transaction date (2026-01-09): zero holdings
    const replayBefore = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDate: LocalDate.from('2026-01-09'),
    });
    expect(replayBefore.state.assets.has(String(ASSET_PETR4))).toBe(false);
    expect(replayBefore.state.assets.size).toBe(0);

    // B) As of transaction date (2026-01-10) and thereafter (2026-01-15):
    // Net quantity must be exactly 120 (100 - 100 + 120 = 120, never 100, never 220)
    const replayAfter = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDate: LocalDate.from('2026-01-15'),
    });
    const petr4Position = replayAfter.state.assets.get(String(ASSET_PETR4));
    expect(petr4Position).toBeDefined();
    expect(petr4Position!.quantity.toString()).toBe('120');
    expect(petr4Position!.averageCost?.equals(Money.from('40.00', BRL))).toBe(true);
    expect(petr4Position!.totalCost?.equals(Money.from('4800.00', BRL))).toBe(true); // 120 * 40.00 = 4,800.00

    // C) Timeline Replay across multiple dates
    const timeline = replayPortfolioTimeline({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDates: [
        LocalDate.from('2026-01-09'),
        LocalDate.from('2026-01-10'),
        LocalDate.from('2026-01-20'),
      ],
    });
    expect(timeline.snapshots.length).toBe(3);
    expect(timeline.snapshots[0].state.assets.size).toBe(0);
    expect(timeline.snapshots[1].state.assets.get(String(ASSET_PETR4))!.quantity.toString()).toBe(
      '120',
    );
    expect(timeline.snapshots[2].state.assets.get(String(ASSET_PETR4))!.quantity.toString()).toBe(
      '120',
    );

    // 5. Performance Asset Universe Derivation:
    // Window [2026-01-01 to 2026-01-09] (before trade): PETR4 is not in universe
    const universePrior = derivePerformanceAssetUniverse({
      transactions: txRepo.transactions,
      from: LocalDate.from('2026-01-01'),
      to: LocalDate.from('2026-01-09'),
    });
    expect(universePrior.map(String)).not.toContain(String(ASSET_PETR4));

    // Window [2026-01-10 to 2026-01-20]: PETR4 is in universe exactly ONCE (zero duplicate asset entries)
    const universeActive = derivePerformanceAssetUniverse({
      transactions: txRepo.transactions,
      from: LocalDate.from('2026-01-10'),
      to: LocalDate.from('2026-01-20'),
    });
    expect(universeActive.map(String)).toContain(String(ASSET_PETR4));
    const petr4Occurrences = universeActive.filter((id) => String(id) === String(ASSET_PETR4));
    expect(petr4Occurrences.length).toBe(1);

    // 6. Valuation & Performance Data Selection:
    // When valued against market quote R$ 42.00, position market value is 120 * 42 = 5,040.00
    // Unrealized gain = 5,040 - 4,800 = +240.00 (+5.00%)
    const quote: ValuationQuote = {
      assetId: String(ASSET_PETR4),
      price: '42.00',
      currency: BRL,
      asOf: '2026-01-15',
      receivedAt: '2026-01-15T18:00:00Z',
      source: 'BRAPI',
      status: 'EOD',
      freshness: 'FRESH',
      providerSymbol: 'PETR4',
    };
    const valuation = valuePosition(
      {
        assetId: String(ASSET_PETR4),
        accountId: String(ACCOUNT_ID),
        quantity: petr4Position!.quantity.toString(),
        currency: BRL,
        totalCost: petr4Position!.totalCost?.amount ?? null,
        averageCost: petr4Position!.averageCost?.amount ?? null,
        costBasisStatus: 'KNOWN',
      },
      quote,
    );
    expect(Money.from(valuation.marketValue!.amount, BRL).equals(Money.from('5040.00', BRL))).toBe(
      true,
    );
    expect(
      Money.from(valuation.unrealizedGainLoss!.amount, BRL).equals(Money.from('240.00', BRL)),
    ).toBe(true);
    expect(valuation.unrealizedGainLossPercent).toBe('5');
    expect(valuation.status).toBe('VALUED');
  });

  // =========================================================================
  // Case 2: CANCEL Mode — Erroneous Transaction Estorno
  // =========================================================================
  it('Case 2: RectifyTransactionUseCase (mode: CANCEL) neutralizes position to zero under ADR-039 and cleanly drops asset from post-cancellation universe', async () => {
    // 1. BUY transaction: 50 VALE3 @ R$ 60.00 on 2026-01-12
    const originalBuy = TransactionFactory.createBuy({
      id: createTransactionId('b0000000-0000-4000-8000-000000000002'),
      portfolioId: PORTFOLIO_ID,
      accountId: ACCOUNT_ID,
      assetId: ASSET_VALE3,
      tradeDate: '2026-01-12',
      quantity: '50',
      unitPrice: '60.00',
      fees: '0.00',
      taxes: '0.00',
      currency: BRL,
      source: 'MANUAL',
      createdAt: new Date('2026-01-12T10:00:00.000Z'),
      updatedAt: new Date('2026-01-12T10:00:00.000Z'),
    });
    txRepo.transactions.push(originalBuy);

    // Replay at 2026-01-13 (holding 50 shares before cancellation)
    const replayBeforeCancel = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDate: LocalDate.from('2026-01-13'),
    });
    expect(replayBeforeCancel.state.assets.get(String(ASSET_VALE3))!.quantity.toString()).toBe(
      '50',
    );

    // 2. Execute canonical cancellation use case on 2026-01-15:
    const result = await useCase.execute({
      portfolioId: String(PORTFOLIO_ID),
      originalTransactionId: String(originalBuy.id),
      mode: 'CANCEL',
      reason: 'Ordem executada em conta errada',
      idempotencyKey: 'idemp-cancel-case-2',
      userId: USER_ID,
    });

    expect(result.mode).toBe('CANCEL');
    expect(result.replacementTransaction).toBeNull();
    expect(txRepo.transactions.length).toBe(2);

    const compTx = result.compensatingTransaction;
    expect(compTx.type).toBe('SELL');
    expect(compTx.quantity.toString()).toBe('50');
    expect(compTx.notes).toContain(`[COMPENSAÇÃO ref ${originalBuy.id}] Estorno cancelatório`);

    // 3. Replay after cancellation (2026-01-16):
    // Net position is exactly ZERO. Under ADR-039, zero-quantity holdings are omitted from assets map.
    const replayAfterCancel = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDate: LocalDate.from('2026-01-16'),
    });
    expect(replayAfterCancel.state.assets.has(String(ASSET_VALE3))).toBe(false);
    expect(replayAfterCancel.state.assets.size).toBe(0);

    // 4. Performance Asset Universe Resolution:
    // Window spanning cancellation [2026-01-01 to 2026-01-16]: VALE3 had transaction exposure, so it is included
    const universeSpanning = derivePerformanceAssetUniverse({
      transactions: txRepo.transactions,
      from: LocalDate.from('2026-01-01'),
      to: LocalDate.from('2026-01-16'),
    });
    expect(universeSpanning.map(String)).toContain(String(ASSET_VALE3));

    // Window strictly AFTER cancellation [2026-01-17 to 2026-02-01]:
    // Custody is zero, zero transactions in window -> VALE3 is strictly EXCLUDED
    const universeSubsequent = derivePerformanceAssetUniverse({
      transactions: txRepo.transactions,
      from: LocalDate.from('2026-01-17'),
      to: LocalDate.from('2026-02-01'),
    });
    expect(universeSubsequent.map(String)).not.toContain(String(ASSET_VALE3));
  });

  // =========================================================================
  // Case 3: ASSET RECTIFICATION — Changing Asset ID from PETR4 to VALE3
  // =========================================================================
  it('Case 3: RectifyTransactionUseCase correcting erroneous asset attribution (PETR4 -> VALE3) transfers custody cleanly and segments universe correctly', async () => {
    // 1. Initial transaction erroneously registered 100 PETR4 @ 35.00 on 2026-01-10
    const erroneousBuy = TransactionFactory.createBuy({
      id: createTransactionId('b0000000-0000-4000-8000-000000000003'),
      portfolioId: PORTFOLIO_ID,
      accountId: ACCOUNT_ID,
      assetId: ASSET_PETR4,
      tradeDate: '2026-01-10',
      quantity: '100',
      unitPrice: '35.00',
      fees: '0.00',
      taxes: '0.00',
      currency: BRL,
      source: 'MANUAL',
      createdAt: new Date('2026-01-10T10:00:00.000Z'),
      updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    });
    txRepo.transactions.push(erroneousBuy);

    // 2. Canonical rectification: replace with 100 VALE3 @ 65.00 on 2026-01-10
    const result = await useCase.execute({
      portfolioId: String(PORTFOLIO_ID),
      originalTransactionId: String(erroneousBuy.id),
      mode: 'RECTIFY',
      reason: 'Ativo informado incorretamente',
      idempotencyKey: 'idemp-asset-rectify-case-3',
      replacement: {
        assetId: String(ASSET_VALE3),
        type: 'BUY',
        quantity: '100',
        unitPrice: '65.00',
        fees: '0.00',
        tradeDate: '2026-01-10',
      },
      userId: USER_ID,
    });

    expect(result.mode).toBe('RECTIFY');
    expect(result.compensatingTransaction.assetId).toBe(ASSET_PETR4);
    expect(result.compensatingTransaction.type).toBe('SELL');
    expect(result.replacementTransaction!.assetId).toBe(ASSET_VALE3);
    expect(result.replacementTransaction!.type).toBe('BUY');

    // 3. Replay state after rectification:
    // PETR4: 100 - 100 = 0 (omitted from assets map under ADR-039)
    // VALE3: 100 shares @ 65.00 (active holding)
    const replay = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDate: LocalDate.from('2026-01-15'),
    });
    expect(replay.state.assets.has(String(ASSET_PETR4))).toBe(false);
    expect(replay.state.assets.has(String(ASSET_VALE3))).toBe(true);

    const vale3Pos = replay.state.assets.get(String(ASSET_VALE3))!;
    expect(vale3Pos.quantity.toString()).toBe('100');
    expect(vale3Pos.averageCost?.equals(Money.from('65.00', BRL))).toBe(true);

    // 4. Performance universe analysis:
    // Window [2026-01-01 to 2026-01-15]: includes BOTH assets (both had transaction activity)
    const universeOverlap = derivePerformanceAssetUniverse({
      transactions: txRepo.transactions,
      from: LocalDate.from('2026-01-01'),
      to: LocalDate.from('2026-01-15'),
    });
    expect(universeOverlap.map(String)).toContain(String(ASSET_PETR4));
    expect(universeOverlap.map(String)).toContain(String(ASSET_VALE3));

    // Subsequent window [2026-01-16 to 2026-01-31]: includes ONLY VALE3, PETR4 is completely excluded
    const universeFuture = derivePerformanceAssetUniverse({
      transactions: txRepo.transactions,
      from: LocalDate.from('2026-01-16'),
      to: LocalDate.from('2026-01-31'),
    });
    expect(universeFuture.map(String)).toContain(String(ASSET_VALE3));
    expect(universeFuture.map(String)).not.toContain(String(ASSET_PETR4));
  });

  // =========================================================================
  // Case 4: Idempotency & Replay Determinism under 3-Tuple Ordering
  // =========================================================================
  it('Case 4: Canonical 3-tuple sort (tradeDate ASC, createdAt ASC, id ASC) guarantees deterministic replay with no race conditions', async () => {
    // Original BUY
    const buy1 = TransactionFactory.createBuy({
      id: createTransactionId('b0000000-0000-4000-8000-000000000010'),
      portfolioId: PORTFOLIO_ID,
      accountId: ACCOUNT_ID,
      assetId: ASSET_PETR4,
      tradeDate: '2026-01-10',
      quantity: '50',
      unitPrice: '30.00',
      fees: '0.00',
      taxes: '0.00',
      currency: BRL,
      source: 'MANUAL',
      createdAt: new Date('2026-01-10T10:00:00.000Z'),
      updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    });
    txRepo.transactions.push(buy1);

    // Rectify to 75 shares
    await useCase.execute({
      portfolioId: String(PORTFOLIO_ID),
      originalTransactionId: String(buy1.id),
      mode: 'RECTIFY',
      reason: 'Ajuste de lote',
      idempotencyKey: 'idemp-sort-test',
      replacement: {
        type: 'BUY',
        quantity: '75',
        unitPrice: '30.00',
        fees: '0.00',
        tradeDate: '2026-01-10',
      },
      userId: USER_ID,
    });

    // Run replay with original order
    const result1 = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: txRepo.transactions,
      asOfDate: LocalDate.from('2026-01-10'),
    });

    // Run replay with randomly shuffled order
    const shuffled = [...txRepo.transactions].reverse();
    const result2 = replayPortfolio({
      portfolioId: String(PORTFOLIO_ID),
      transactions: shuffled,
      asOfDate: LocalDate.from('2026-01-10'),
    });

    expect(result1.state.assets.get(String(ASSET_PETR4))!.quantity.toString()).toBe('75');
    expect(result2.state.assets.get(String(ASSET_PETR4))!.quantity.toString()).toBe('75');
    expect(
      result1.state.assets.get(String(ASSET_PETR4))!.totalCost?.equals(Money.from('2250.00', BRL)),
    ).toBe(true);
    expect(
      result2.state.assets.get(String(ASSET_PETR4))!.totalCost?.equals(Money.from('2250.00', BRL)),
    ).toBe(true);
  });
});
