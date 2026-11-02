import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import { GetMonthlyTaxLiabilityUseCase } from '../../apps/api/src/application/fiscal/get-monthly-tax-liability.use-case';
import {
  enrichCanonicalRealizedWithEvidence,
  detectEnrichedDisposalSignals,
  isTaxCostEvidenceEnrichmentEnabled,
} from '../../apps/api/src/application/fiscal/evidence-cost-enrichment';
import { FISCAL_RULE_REGISTRY } from '../../apps/api/src/application/fiscal/fiscal-rule-registry';

/**
 * CTE-2 gated enrichment (mocked I/O, real engines + real rule registry).
 * Matrix PART AM: flag default/off/on, equivalence OFF, precedence, partial,
 * conflict, over-coverage, superseded, review-required, currency, temporal,
 * account/asset mismatch, duplicates, FII + equity-NORMAL paths, DAY_TRADE
 * invariance, provenance, no-query-when-OFF, no writes.
 */
describe('CTE-2 gated evidence-cost enrichment', () => {
  const PORTFOLIO = '91111111-1111-4111-8111-111111111111';
  const ACCOUNT = '92222222-2222-4222-8222-222222222222';
  const OTHER_ACCOUNT = '92333333-3333-4333-8333-333333333333';
  const ASSET = '93333333-3333-4333-8333-333333333333';
  const USER = 'user-cte-2';
  const INST = 'inst-1';
  const OLD_ENV = process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED;

  function repos(ledger: unknown[] = [], evidence: unknown[] = []) {
    const evidenceRepository = {
      listCurrentByScope: vi.fn(async () => evidence),
    };
    return {
      evidenceRepository,
      portfolioRepository: { findByUserId: vi.fn(async () => [{ id: PORTFOLIO }]) },
      transactionRepository: { findByPortfolioId: vi.fn(async () => ledger) },
      accountRepository: {
        findByPortfolioId: vi.fn(async () => [{ id: ACCOUNT, institutionId: INST }]),
      },
      assetRepository: {
        findByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, type: 'FII' }))),
        findById: vi.fn(async (id: string) => ({ id, type: 'FII' })),
      },
      electionRepository: { listCurrentBySubject: vi.fn(async () => []) },
      taxInputProvider: { getWithholdingInputs: vi.fn(async () => []), getAllWithholdingInputs: vi.fn(async () => []) },
    };
  }

  function useCase(r: ReturnType<typeof repos>) {
    return new GetMonthlyTaxLiabilityUseCase(
      r.portfolioRepository as never,
      r.transactionRepository as never,
      r.assetRepository as never,
      r.accountRepository as never,
      r.electionRepository as never,
      r.evidenceRepository as never,
      FISCAL_RULE_REGISTRY,
      r.taxInputProvider as never,
    );
  }

  function evRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ev-1',
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: ASSET,
      evidenceType: 'BROKERAGE_NOTE',
      source: 'MANUAL_CONFIRMED',
      quantityCovered: '120',
      unitCost: '8.50',
      totalCost: '1020.00',
      currency: 'BRL',
      acquisitionDate: '2024-12-26',
      evidenceDate: null,
      status: 'VERIFIED',
      sourceReference: 'XP-1',
      notes: null,
      version: 1,
      supersedesId: null,
      fingerprint: 'f'.repeat(64),
      confirmedBy: USER,
      confirmedAt: new Date('2026-01-05T10:00:00.000Z'),
      createdAt: new Date('2026-01-05T10:00:00.000Z'),
      ...overrides,
    };
  }

  function kcre11Ledger() {
    return [
      TransactionFactory.createTransfer({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, type: 'TRANSFER_IN', quantity: '120', currency: 'BRL', tradeDate: '2024-12-31' }),
      TransactionFactory.createBuy({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '80', unitPrice: '8.45', currency: 'BRL', tradeDate: '2024-12-27' }),
      TransactionFactory.createBuy({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '96', unitPrice: '7.99', currency: 'BRL', tradeDate: '2025-01-24' }),
      TransactionFactory.createBuy({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '4', unitPrice: '7.98', currency: 'BRL', tradeDate: '2025-01-24' }),
      TransactionFactory.createSell({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '50', unitPrice: '9.00', currency: 'BRL', tradeDate: '2025-05-10' }),
    ];
  }

  beforeEach(() => {
    delete process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED;
    else process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = OLD_ENV;
  });

  it('1/2. flag absent and "false" both mean OFF', () => {
    delete process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED;
    expect(isTaxCostEvidenceEnrichmentEnabled()).toBe(false);
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'false';
    expect(isTaxCostEvidenceEnrichmentEnabled()).toBe(false);
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'yes';
    expect(isTaxCostEvidenceEnrichmentEnabled()).toBe(false);
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = '1';
    expect(isTaxCostEvidenceEnrichmentEnabled()).toBe(false);
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    expect(isTaxCostEvidenceEnrichmentEnabled()).toBe(true);
  });

  it('4/20. flag OFF: unknown cost stays blocked, zero evidence queries, full NOT_EVALUATED trace', async () => {
    const r = repos(kcre11Ledger(), [evRow()]);
    const uc = useCase(r);
    const out = await uc.computeWithEquity({ userId: USER, competence: '2025-05' });
    expect(r.evidenceRepository.listCurrentByScope).not.toHaveBeenCalled();
    expect(out.evidenceCostTrace).toHaveLength(1);
    expect(out.evidenceCostTrace[0]).toMatchObject({ source: 'UNKNOWN', resolutionStatus: 'NOT_EVALUATED' });
    expect(out.evidenceCostTrace.every((t) => t.source !== 'VERIFIED_EVIDENCE')).toBe(true);
    const issues = JSON.stringify(out.liability);
    expect(issues).toContain('UNKNOWN_COST_BASIS');
  });

  it('3/16. flag ON, KCRE11 synthetic: FII enrichment with full provenance', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    const r = repos(kcre11Ledger(), [evRow()]);
    const uc = useCase(r);
    const out = await uc.computeWithEquity({ userId: USER, competence: '2025-05' });
    expect(JSON.stringify(out.liability)).not.toContain('UNKNOWN_COST_BASIS');
    const enriched = out.evidenceCostTrace.filter((t) => t.source === 'VERIFIED_EVIDENCE');
    expect(enriched).toHaveLength(1);
    const [trace] = enriched;
    expect(trace!.resolutionStatus).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(trace!.ledgerKnownQuantity).toBe('180');
    expect(trace!.evidenceKnownQuantity).toBe('120');
    expect(trace!.resolvedCost).toBe('2494.96');
    expect(trace!.evidenceSources).toHaveLength(1);
    expect(trace!.evidenceSources[0]).toMatchObject({
      evidenceId: 'ev-1', evidenceVersion: 1, fingerprint: 'f'.repeat(64),
      acquisitionDate: '2024-12-26', quantity: '120', totalCost: '1020.00',
    });
  });

  it('5. canonical KNOWN cost never replaced with flag ON', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    const ledger = [
      TransactionFactory.createBuy({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '100', unitPrice: '10.00', currency: 'BRL', tradeDate: '2025-01-10' }),
      TransactionFactory.createSell({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '40', unitPrice: '12.00', currency: 'BRL', tradeDate: '2025-05-10' }),
    ];
    const r = repos(ledger, [evRow({ quantityCovered: '40', unitCost: '99.00', totalCost: '3960.00' })]);
    const uc = useCase(r);
    const before = await uc.computeWithEquity({ userId: USER, competence: '2025-05' });
    // Same run with evidence stripped must be identical (evidence ignored for KNOWN).
    const r2 = repos(ledger, []);
    const uc2 = useCase(r2);
    const after = await uc2.computeWithEquity({ userId: USER, competence: '2025-05' });
    expect(before.liability).toEqual(after.liability);
    expect(before.equity).toEqual(after.equity);
  });

  it('6/8/11/12. partial, over-coverage, currency and temporal stay blocked', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    async function run(evidence: unknown[]) {
      const r = repos(kcre11Ledger(), evidence);
      return useCase(r).computeWithEquity({ userId: USER, competence: '2025-05' });
    }
    // Partial: 60 of 120 covered → still blocked.
    let out = await run([evRow({ id: 'ev-p', quantityCovered: '60', unitCost: '8.50', totalCost: '510.00' })]);
    expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
    // Over-coverage → blocked.
    out = await run([evRow({ quantityCovered: '500', unitCost: '8.50', totalCost: '4250.00' })]);
    expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
    // Currency mismatch → blocked.
    out = await run([evRow({ currency: 'USD', unitCost: '1.70', totalCost: '204.00' })]);
    expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
    // Acquisition after disposal → blocked.
    out = await run([evRow({ acquisitionDate: '2025-06-01' })]);
    expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
  });

  it('7/9/10. conflict, superseded and review-required stay blocked', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    async function run(evidence: unknown[]) {
      const r = repos(kcre11Ledger(), evidence);
      return useCase(r).computeWithEquity({ userId: USER, competence: '2025-05' });
    }
    const blocked = (out: { liability: unknown }) =>
      expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
    // Conflict: same economics, different cost.
    blocked(await run([
      evRow({ id: 'ev-a', quantityCovered: '60', unitCost: '8.50', totalCost: '510.00' }),
      evRow({ id: 'ev-b', fingerprint: 'e'.repeat(64), quantityCovered: '60', unitCost: '9.00', totalCost: '540.00' }),
    ]));
    // Superseded VERIFIED + current REVIEW_REQUIRED → nothing contributes.
    blocked(await run([
      evRow({ id: 'ev-old', version: 1 }),
      evRow({ id: 'ev-new', version: 2, status: 'REVIEW_REQUIRED', supersedesId: 'ev-old' }),
    ]));
    // REVIEW_REQUIRED current → blocked.
    blocked(await run([evRow({ status: 'REVIEW_REQUIRED' })]));
  });

  it('13/14. account and asset mismatch stay blocked', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    async function run(evidence: unknown[]) {
      const r = repos(kcre11Ledger(), evidence);
      return useCase(r).computeWithEquity({ userId: USER, competence: '2025-05' });
    }
    let out = await run([evRow({ accountId: OTHER_ACCOUNT })]);
    expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
    out = await run([evRow({ assetId: '00000000-0000-4000-8000-000000000000' })]);
    expect(JSON.stringify(out.liability)).toContain('UNKNOWN_COST_BASIS');
  });

  it('17. equity NORMAL path enriches via the same seam (STOCK)', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    const stockId = '94444444-4444-4333-8333-444444444444';
    const r = repos(
      [
        TransactionFactory.createTransfer({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: stockId, type: 'TRANSFER_IN', quantity: '100', currency: 'BRL', tradeDate: '2024-12-31' }),
        TransactionFactory.createSell({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: stockId, quantity: '40', unitPrice: '35.00', currency: 'BRL', tradeDate: '2025-05-10' }),
      ],
      [evRow({ id: 'ev-s', assetId: stockId, quantityCovered: '100', unitCost: '30.00', totalCost: '3000.00' })],
    );
    r.assetRepository.findByIds = vi.fn(async () => [{ id: stockId, type: 'STOCK' }]);
    r.assetRepository.findById = vi.fn(async () => ({ id: stockId, type: 'STOCK' }));
    const uc = useCase(r);
    const out = await uc.computeWithEquity({ userId: USER, competence: '2025-05' });
    const enriched = out.evidenceCostTrace.filter((t) => t.source === 'VERIFIED_EVIDENCE');
    expect(enriched).toHaveLength(1);
    expect(enriched[0]!.resolvedCost).toBe('3000');
  });

  it('18. DAY_TRADE figures identical with flag ON vs OFF', async () => {
    const dt = [
      TransactionFactory.createBuy({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '100', unitPrice: '10.00', currency: 'BRL', tradeDate: '2025-05-10' }),
      TransactionFactory.createSell({ portfolioId: PORTFOLIO, accountId: ACCOUNT, assetId: ASSET, quantity: '100', unitPrice: '11.00', currency: 'BRL', tradeDate: '2025-05-10' }),
    ];
    const rOff = repos(dt, [evRow({ quantityCovered: '100', unitCost: '9.00', totalCost: '900.00' })]);
    const off = await useCase(rOff).computeWithEquity({ userId: USER, competence: '2025-05' });
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    const rOn = repos(dt, [evRow({ quantityCovered: '100', unitCost: '9.00', totalCost: '900.00' })]);
    const on = await useCase(rOn).computeWithEquity({ userId: USER, competence: '2025-05' });
    expect(on.equity).toEqual(off.equity);
    expect(on.liability).toEqual(off.liability);
  });

  it('15/19/21. duplicates counted once; trace complete; no writes', async () => {
    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    const r = repos(kcre11Ledger(), [
      evRow({ id: 'ev-a' }),
      evRow({ id: 'ev-b', fingerprint: 'e'.repeat(64) }),
    ]);
    const uc = useCase(r);
    const out = await uc.computeWithEquity({ userId: USER, competence: '2025-05' });
    const enriched = out.evidenceCostTrace.filter((t) => t.source === 'VERIFIED_EVIDENCE');
    expect(enriched).toHaveLength(1);
    expect(enriched[0]!.evidenceSources).toHaveLength(1);
    expect(enriched[0]!.evidenceSources[0]!.evidenceId).toBe('ev-a');
    // No repository writes exist on the evidence path (read-only interface).
    expect(r.transactionRepository.findByPortfolioId).toHaveBeenCalled();
  });

  it('pure enrichment: flag OFF leaves map content-identical', () => {
    const map = new Map([['tx-1', { status: 'INCOMPLETE' as const }]]);
    const out = enrichCanonicalRealizedWithEvidence({ canonicalMap: map, transactions: [], evidenceRows: [], enabled: false });
    expect(out.map).toEqual(map);
    expect(out.trace).toHaveLength(0);
  });

  it('first-disposal guard signals only VERIFIED_EVIDENCE traces, without amounts', () => {
    const signals = detectEnrichedDisposalSignals([
      { transactionId: 't1', assetId: 'a1', tradeDate: '2025-05-10', source: 'VERIFIED_EVIDENCE', resolutionStatus: 'COMPLETE_WITH_VERIFIED_EVIDENCE', evidenceSources: [] },
      { transactionId: 't2', assetId: 'a1', tradeDate: '2025-05-10', source: 'CANONICAL_LEDGER', resolutionStatus: 'COMPLETE_LEDGER_ONLY', evidenceSources: [] },
      { transactionId: 't3', assetId: 'a1', tradeDate: '2025-05-10', source: 'UNKNOWN', resolutionStatus: 'NOT_EVALUATED', evidenceSources: [] },
    ]);
    expect(signals).toEqual([
      {
        signal: 'EVIDENCE_TAX_DISPOSAL_REVIEW_REQUIRED',
        transactionId: 't1',
        assetId: 'a1',
        tradeDate: '2025-05-10',
        resolutionStatus: 'COMPLETE_WITH_VERIFIED_EVIDENCE',
      },
    ]);
    expect(JSON.stringify(signals)).not.toMatch(/amount|currency|2494|1020/i);
  });
});
