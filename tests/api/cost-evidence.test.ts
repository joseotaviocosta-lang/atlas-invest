import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionFactory } from '@atlas/domain';
import { EntityNotFoundError, CrossPortfolioIntegrityError } from '@atlas/database';
import { CostEvidenceUseCase } from '../../apps/api/src/application/cost-evidence/cost-evidence.use-case';
import { CostEvidenceAssessmentUseCase } from '../../apps/api/src/application/cost-evidence/cost-evidence-assessment.use-case';
import type { CostBasisEvidenceRow } from '@atlas/database';

/**
 * Cost-basis evidence use-cases (mocked repositories, real domain + engine).
 * No DB, no network. Covers the AJ matrix at API level: lifecycle,
 * transitions, duplicate/overlap/over-coverage gates, exact decimals,
 * partial/full coverage, ledger immutability, and security rejects.
 */
describe('CostEvidenceUseCase + Assessment (mocked I/O)', () => {
  const PORTFOLIO = '81111111-1111-4111-8111-111111111111';
  const ACCOUNT = '82222222-2222-4222-8222-222222222222';
  const OTHER_ACCOUNT = '82333333-3333-4333-8333-333333333333';
  const ASSET = '83333333-3333-4333-8333-333333333333';
  const USER = 'user-ce-1';
  const OTHER_USER = 'user-ce-2';

  const portfolio = { id: PORTFOLIO, userId: USER };
  const account = { id: ACCOUNT, portfolioId: PORTFOLIO };
  const asset = { id: ASSET, ticker: 'KCRE11' };

  function ledger() {
    return [
      TransactionFactory.createTransfer({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET,
        type: 'TRANSFER_IN',
        quantity: '120',
        currency: 'BRL',
        tradeDate: '2024-12-31',
      }),
      TransactionFactory.createBuy({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '80',
        unitPrice: '8.45',
        currency: 'BRL',
        tradeDate: '2024-12-27',
      }),
      TransactionFactory.createBuy({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: ASSET,
        quantity: '100',
        unitPrice: '7.99',
        currency: 'BRL',
        tradeDate: '2025-01-24',
      }),
    ];
  }

  /** In-memory evidence store honoring fingerprint idempotency + revisions. */
  function evidenceStore() {
    const rows: CostBasisEvidenceRow[] = [];
    let seq = 1;
    return {
      rows,
      findById: vi.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
      listByScope: vi.fn(async () => [...rows].reverse()),
      listCurrentByScope: vi.fn(async () => {
        const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
        return rows.filter((r) => !superseded.has(r.id));
      }),
      create: vi.fn(async (input: Record<string, unknown>) => {
        if (!input['supersedesId']) {
          const existing = rows.find(
            (r) => r.portfolioId === input['portfolioId'] && r.fingerprint === input['fingerprint'],
          );
          if (existing) return { outcome: 'DUPLICATE' as const, record: existing };
        }
        const record = {
          id: `ce-${String(seq++).padStart(4, '0')}`,
          createdAt: new Date('2026-01-05T10:00:00.000Z'),
          version: input['supersedesId']
            ? (rows.find((r) => r.id === input['supersedesId'])?.version ?? 0) + 1
            : 1,
          confirmedBy: null,
          confirmedAt: null,
          rejectedReason: null,
          evidenceDate: null,
          notes: null,
          ...input,
        } as unknown as CostBasisEvidenceRow;
        rows.push(record);
        return { outcome: 'CREATED' as const, record };
      }),
    };
  }

  function repos(txList = ledger()) {
    const store = evidenceStore();
    return {
      store,
      portfolioRepository: { findById: vi.fn(async () => portfolio) },
      accountRepository: {
        findById: vi.fn(async (id: string) =>
          id === ACCOUNT ? account : id === OTHER_ACCOUNT ? { id: OTHER_ACCOUNT, portfolioId: 'other-portfolio' } : null,
        ),
      },
      assetRepository: {
        findByIds: vi.fn(async (ids: string[]) => (ids.includes(ASSET) ? [asset] : [])),
      },
      transactionRepository: {
        findByPortfolioId: vi.fn(async () => txList),
        createMany: vi.fn(async () => {
          throw new Error('ledger must never be written by evidence flow');
        }),
      },
      evidenceRepository: store,
    };
  }

  function useCases(r: ReturnType<typeof repos>) {
    return {
      crud: new CostEvidenceUseCase(
        r.evidenceRepository as never,
        r.transactionRepository as never,
        r.portfolioRepository as never,
        r.accountRepository as never,
        r.assetRepository as never,
      ),
      assess: new CostEvidenceAssessmentUseCase(
        r.evidenceRepository as never,
        r.transactionRepository as never,
        r.portfolioRepository as never,
        r.accountRepository as never,
        r.assetRepository as never,
      ),
    };
  }

  const draft = () => ({
    accountId: ACCOUNT,
    assetId: ASSET,
    evidenceType: 'BROKERAGE_NOTE',
    quantityCovered: '120',
    unitCost: '8.50',
    totalCost: '1020.00',
    currency: 'BRL',
    acquisitionDate: '2024-12-26',
    sourceReference: 'XP-NOTA-2024-1234',
    notes: 'Pregão 26/12/2024',
  });

  async function verifiedFlow() {
    const r = repos();
    const { crud } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, draft());
    const submitted = await crud.submit(PORTFOLIO, USER, created.record.id);
    const verified = await crud.verify(PORTFOLIO, USER, submitted.id);
    return { r, crud, verified };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates DRAFT evidence with exact decimals and never touches the ledger', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const before = r.transactionRepository.findByPortfolioId.mock.calls.length;
    const { outcome, record } = await crud.create(PORTFOLIO, USER, draft());
    expect(outcome).toBe('CREATED');
    expect(record.status).toBe('DRAFT');
    expect(record.version).toBe(1);
    expect(record.quantityCovered).toBe('120');
    expect(record.unitCost).toBe('8.5');
    expect(record.totalCost).toBe('1020');
    expect(record.acquisitionDate).toBe('2024-12-26');
    expect(record.confirmedBy).toBeNull();
    expect(r.transactionRepository.createMany).not.toHaveBeenCalled();
    expect(r.transactionRepository.findByPortfolioId.mock.calls.length).toBe(before);
  });

  it('creates REVIEW_REQUIRED directly when requested', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const { record } = await crud.create(PORTFOLIO, USER, { ...draft(), status: 'REVIEW_REQUIRED' });
    expect(record.status).toBe('REVIEW_REQUIRED');
  });

  it('derives the missing cost side exactly', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const { record } = await crud.create(PORTFOLIO, USER, { ...draft(), totalCost: undefined });
    expect(record.totalCost).toBe('1020');
  });

  it('rejects amount mismatch, zero quantity, bad dates, and bad currency', async () => {
    const r = repos();
    const { crud } = useCases(r);
    await expect(crud.create(PORTFOLIO, USER, { ...draft(), totalCost: '1020.01' })).rejects.toThrow(
      /COST_EVIDENCE_AMOUNT_MISMATCH/,
    );
    await expect(crud.create(PORTFOLIO, USER, { ...draft(), quantityCovered: '0' })).rejects.toThrow();
    await expect(
      crud.create(PORTFOLIO, USER, { ...draft(), acquisitionDate: '2026-02-30' }),
    ).rejects.toThrow();
    await expect(crud.create(PORTFOLIO, USER, { ...draft(), currency: 'XXX' })).rejects.toThrow();
    await expect(crud.create(PORTFOLIO, USER, { ...draft(), evidenceType: 'GUESS' })).rejects.toThrow();
  });

  it('returns DUPLICATE on exact resubmission without a new row', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const first = await crud.create(PORTFOLIO, USER, draft());
    const second = await crud.create(PORTFOLIO, USER, draft());
    expect(second.outcome).toBe('DUPLICATE');
    expect(second.record.id).toBe(first.record.id);
    expect(r.store.rows).toHaveLength(1);
  });

  it('walks DRAFT → REVIEW_REQUIRED → VERIFIED with audit revisions', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, draft());
    const submitted = await crud.submit(PORTFOLIO, USER, created.record.id);
    expect(submitted.status).toBe('REVIEW_REQUIRED');
    expect(submitted.version).toBe(2);
    expect(submitted.supersedesId).toBe(created.record.id);
    const verified = await crud.verify(PORTFOLIO, USER, submitted.id);
    expect(verified.status).toBe('VERIFIED');
    expect(verified.version).toBe(3);
    expect(verified.confirmedBy).toBe(USER);
    expect(r.store.rows).toHaveLength(3);
  });

  it('rejects invalid transitions fail-closed', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, draft());
    // VERIFY on DRAFT is forbidden.
    await expect(crud.verify(PORTFOLIO, USER, created.record.id)).rejects.toMatchObject({
      status: 409,
    });
    // Double SUBMIT is forbidden.
    const submitted = await crud.submit(PORTFOLIO, USER, created.record.id);
    await expect(crud.submit(PORTFOLIO, USER, submitted.id)).rejects.toMatchObject({ status: 409 });
    // Double VERIFY is forbidden.
    const verified = await crud.verify(PORTFOLIO, USER, submitted.id);
    await expect(crud.verify(PORTFOLIO, USER, verified.id)).rejects.toMatchObject({ status: 409 });
    // SUBMIT on a superseded row is forbidden.
    await expect(crud.submit(PORTFOLIO, USER, created.record.id)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rejects with mandatory reason and forbids empty reasons', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, { ...draft(), status: 'REVIEW_REQUIRED' });
    await expect(crud.reject(PORTFOLIO, USER, created.record.id, '   ')).rejects.toMatchObject({
      status: 409,
    });
    const rejected = await crud.reject(PORTFOLIO, USER, created.record.id, 'Documento ilegível');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectedReason).toBe('Documento ilegível');
  });

  it('revise resets VERIFIED to REVIEW_REQUIRED and preserves history', async () => {
    const { crud, verified } = await verifiedFlow().then(async (f) => ({
      crud: f.crud,
      verified: f.verified,
      r: f.r,
    }));
    const { record } = await crud.revise(PORTFOLIO, USER, verified.id, { notes: 'Correção' });
    expect(record.status).toBe('REVIEW_REQUIRED');
    expect(record.version).toBe(4);
    expect(record.supersedesId).toBe(verified.id);
    expect(record.notes).toBe('Correção');
  });

  it('blocks verification that would over-cover the live position', async () => {
    const r = repos();
    const { crud } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, {
      ...draft(),
      quantityCovered: '500',
      unitCost: '8.50',
      totalCost: '4250.00',
      status: 'REVIEW_REQUIRED',
    });
    // Position is 300 (120 + 80 + 100); ledger knows 180; 180 + 500 > 300.
    await expect(crud.verify(PORTFOLIO, USER, created.record.id)).rejects.toMatchObject({
      status: 409,
    });
    // Row stays un-verified.
    expect(r.store.rows.every((row) => row.status !== 'VERIFIED')).toBe(true);
  });

  it('assesses PARTIAL then COMPLETE across the verify flow (KCRE11-shaped)', async () => {
    const r = repos();
    const { crud, assess } = useCases(r);
    const before = await assess.assess(PORTFOLIO, USER, ACCOUNT, ASSET);
    expect(before.status).toBe('PARTIAL');
    expect(before.positionQuantity).toBe('300');
    expect(before.ledgerKnownQuantity).toBe('180');
    expect(before.evidenceCoveredQuantity).toBe('0');
    expect(before.uncoveredQuantity).toBe('120');
    expect(before.coveragePercent).toBe('60.00');

    const created = await crud.create(PORTFOLIO, USER, draft());
    const submitted = await crud.submit(PORTFOLIO, USER, created.record.id);
    await crud.verify(PORTFOLIO, USER, submitted.id);
    const after = await assess.assess(PORTFOLIO, USER, ACCOUNT, ASSET);
    expect(after.status).toBe('COMPLETE');
    expect(after.totalCoveredQuantity).toBe('300');
    expect(after.uncoveredQuantity).toBe('0');
    expect(after.coveragePercent).toBe('100.00');
    expect(after.verifiedKnownCost).toEqual([{ amount: '2495', currency: 'BRL' }]);
  });

  it('preview projects hypothetical coverage without persisting', async () => {
    const r = repos();
    const { assess } = useCases(r);
    const preview = await assess.preview(PORTFOLIO, USER, draft());
    expect(preview.status).toBe('COMPLETE');
    expect(preview.totalCoveredQuantity).toBe('300');
    expect(preview.hypotheticalCoveredQuantity).toBe('120');
    expect(preview.alreadyCoveredWarning).toBeNull();
    expect(r.store.rows).toHaveLength(0);
  });

  it('preview warns when the draft restates ledger-known cost', async () => {
    const r = repos();
    const { assess } = useCases(r);
    const preview = await assess.preview(PORTFOLIO, USER, {
      ...draft(),
      acquisitionDate: '2024-12-27',
      quantityCovered: '80',
      unitCost: '8.45',
      totalCost: '676.00',
    });
    expect(preview.alreadyCoveredWarning).not.toBeNull();
    expect(preview.evidenceCoveredQuantity).toBe('0');
  });

  it('keeps non-BRL evidence segregated without conversion', async () => {
    const r = repos();
    const { crud, assess } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, {
      ...draft(),
      quantityCovered: '120',
      unitCost: '1.70',
      totalCost: '204.00',
      currency: 'USD',
      status: 'REVIEW_REQUIRED',
    });
    await crud.verify(PORTFOLIO, USER, created.record.id);
    const result = await assess.assess(PORTFOLIO, USER, ACCOUNT, ASSET);
    expect(result.status).toBe('COMPLETE');
    expect(result.verifiedKnownCost).toEqual([
      { amount: '1475', currency: 'BRL' },
      { amount: '204', currency: 'USD' },
    ]);
    expect(result.averageKnownCostForCoveredQuantity).toBeNull();
  });

  it('rejects cross-user, cross-account, and unknown-asset access (404 semantics)', async () => {
    const r = repos();
    const { crud, assess } = useCases(r);
    // Wrong user owns nothing.
    await expect(crud.create(PORTFOLIO, OTHER_USER, draft())).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    await expect(assess.assess(PORTFOLIO, OTHER_USER, ACCOUNT, ASSET)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    // Account from another portfolio.
    await expect(
      crud.create(PORTFOLIO, USER, { ...draft(), accountId: OTHER_ACCOUNT }),
    ).rejects.toBeInstanceOf(CrossPortfolioIntegrityError);
    // Unknown asset.
    await expect(
      crud.create(PORTFOLIO, USER, {
        ...draft(),
        assetId: '99999999-9999-4999-8999-999999999999',
      }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    // Unknown evidence id.
    await expect(
      crud.verify(PORTFOLIO, USER, 'ce-9999'),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('leaves ledger count and replay quantity identical after the full flow', async () => {
    const txList = ledger();
    const r = repos(txList);
    const { crud, assess } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, draft());
    const submitted = await crud.submit(PORTFOLIO, USER, created.record.id);
    await crud.verify(PORTFOLIO, USER, submitted.id);
    await assess.assess(PORTFOLIO, USER, ACCOUNT, ASSET);
    expect(txList).toHaveLength(3);
    expect(r.transactionRepository.createMany).not.toHaveBeenCalled();
  });

  it('assessment tax-cost view is server-gated (PART W flag semantics)', async () => {
    const r = repos();
    const { crud, assess } = useCases(r);
    const created = await crud.create(PORTFOLIO, USER, draft());
    const submitted = await crud.submit(PORTFOLIO, USER, created.record.id);
    await crud.verify(PORTFOLIO, USER, submitted.id);

    delete process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED;
    const off = await assess.assess(PORTFOLIO, USER, ACCOUNT, ASSET);
    expect(off.taxCost.enrichmentEnabled).toBe(false);
    expect(off.taxCost.status).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
    expect(off.taxCost.resolvedCost).toEqual({ amount: '2495', currency: 'BRL' });
    expect(off.taxCost.ledgerKnownQuantity).toBe('180');
    expect(off.taxCost.evidenceKnownQuantity).toBe('120');

    process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED = 'true';
    try {
      const on = await assess.assess(PORTFOLIO, USER, ACCOUNT, ASSET);
      expect(on.taxCost.enrichmentEnabled).toBe(true);
      expect(on.taxCost.status).toBe('COMPLETE_WITH_VERIFIED_EVIDENCE');
      expect(on.taxCost.resolvedCost).toEqual({ amount: '2495', currency: 'BRL' });
    } finally {
      delete process.env.TAX_COST_EVIDENCE_ENRICHMENT_ENABLED;
    }
  });
});
