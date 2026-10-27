import { describe, expect, it } from 'vitest';
import { composePortfolioAuditHistory } from '../../apps/api/src/application/portfolios/portfolio-audit-history.compose';
import type {
  IntegrationRunRow,
  ReconciliationDecisionRow,
  TransactionRectificationRow,
  ITransactionRectificationRepository,
  IReconciliationDecisionRepository,
  IIntegrationRunRepository,
} from '@atlas/database';

describe('Operational Audit History Composition (Phase 5S-E)', () => {
  const portfolioId = '11111111-1111-4111-8111-111111111111';
  const currentUserId = 'user-owner-123';

  function createMockRepos(params: {
    rectifications?: TransactionRectificationRow[];
    decisions?: ReconciliationDecisionRow[];
    runs?: IntegrationRunRow[];
  }) {
    const rectifications = params.rectifications ?? [];
    const decisions = params.decisions ?? [];
    const runs = params.runs ?? [];

    const rectRepo: ITransactionRectificationRepository = {
      createWithTransactions: async () => ({ transactions: [], record: {} as never }),
      findByOriginalTransactionId: async () => null,
      findByReplacementTransactionId: async () => null,
      listByOriginalTransactionIds: async () => [],
      listByReplacementTransactionIds: async () => [],
      resolveEffectiveTransactionId: async () => null,
      listByPortfolio: async (_pid, opts) => {
        let filtered = [...rectifications];
        if (opts.cursor) {
          filtered = filtered.filter((r) => r.decidedAt <= opts.cursor!.decidedAt);
        }
        filtered.sort(
          (a, b) => b.decidedAt.getTime() - a.decidedAt.getTime() || b.id.localeCompare(a.id),
        );
        return filtered.slice(0, opts.limit);
      },
    };

    const decRepo: IReconciliationDecisionRepository = {
      create: async () => ({}) as never,
      findByIdentity: async () => null,
      listByRun: async () => [],
      listByRunIds: async () => [],
      listByPortfolio: async (_pid, opts) => {
        let filtered = [...decisions];
        if (opts.cursor) {
          filtered = filtered.filter((d) => d.decidedAt <= opts.cursor!.decidedAt);
        }
        filtered.sort(
          (a, b) => b.decidedAt.getTime() - a.decidedAt.getTime() || b.id.localeCompare(a.id),
        );
        return filtered.slice(0, opts.limit);
      },
    };

    const runRepo: IIntegrationRunRepository = {
      create: async () => ({}) as never,
      recordPreview: async () => ({}) as never,
      recordConfirmation: async () => ({}) as never,
      recordFailure: async () => ({}) as never,
      linkTransactions: async () => 0,
      listTransactionIdsByRun: async () => [],
      countLinksByRunIds: async () => [],
      findById: async () => null,
      findByIdInPortfolios: async () => null,
      listByPortfolioIds: async () => ({ rows: [], hasMore: false }),
      listRecentByPortfolioIds: async () => [],
      listByPortfolio: async () => ({ rows: [], hasMore: false }),
      countByPortfolio: async () => 0,
      listForAudit: async (_pid, opts) => {
        let filtered = [...runs];
        if (opts.cursor) {
          filtered = filtered.filter((r) => r.createdAt <= opts.cursor!.createdAt);
        }
        filtered.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
        );
        return filtered.slice(0, opts.limit);
      },
    };

    return { rectRepo, decRepo, runRepo };
  }

  it('composes and globally sorts events from all 3 operational sources', async () => {
    const t1 = new Date('2026-10-15T10:00:00.000Z');
    const t2 = new Date('2026-10-15T11:00:00.000Z');
    const t3 = new Date('2026-10-15T12:00:00.000Z');

    const rect: TransactionRectificationRow = {
      id: 'rect-1',
      portfolioId,
      originalTransactionId: 'tx-orig-1',
      compensatingTransactionId: 'tx-comp-1',
      replacementTransactionId: 'tx-repl-1',
      mode: 'RECTIFY',
      reason: 'Ajuste de quantidade digitada errada',
      decidedByPrincipal: currentUserId,
      decidedAt: t2,
      createdAt: t2,
    };

    const dec: ReconciliationDecisionRow = {
      id: 'dec-1',
      portfolioId,
      integrationRunId: 'run-alpha',
      source: 'B3',
      sourceItemKey: 'b3:item:1',
      localTransactionId: 'tx-loc-1',
      decision: 'CONFIRM_MATCH',
      decidedByPrincipal: 'other-user-999',
      decidedAt: t3,
      createdAt: t3,
    };

    const run: IntegrationRunRow = {
      id: 'run-1',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: 'notas-outubro.csv',
      sourceAsOf: null,
      status: 'COMPLETED',
      recordsFetched: 10,
      recordsNormalized: 10,
      newCandidates: 10,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      confirmed: 10,
      ignored: 0,
      reconciliation: null,
      partial: false,
      errorCode: null,
      errorMessage: null,
      trigger: 'MANUAL',
      startedAt: t1,
      completedAt: t1,
      createdAt: t1,
      updatedAt: t1,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      rectifications: [rect],
      decisions: [dec],
      runs: [run],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 10 },
    );

    expect(result.items).toHaveLength(3);

    // Global order: occurredAt DESC: dec (t3) -> rect (t2) -> run (t1)
    expect(result.items[0].id).toBe('decision:dec-1');
    expect(result.items[0].eventType).toBe('RECONCILIATION_DECISION_RECORDED');
    expect(result.items[0].category).toBe('RECONCILIATIONS');
    expect(result.items[0].actor?.label).toBe('Usuário'); // other user mapped to friendly 'Usuário'
    expect(result.items[0].description).toBe('Correspondência de importação confirmada.');

    expect(result.items[1].id).toBe('rect:rect-1');
    expect(result.items[1].eventType).toBe('TRANSACTION_RECTIFIED');
    expect(result.items[1].actor?.label).toBe('Você'); // current user mapped to 'Você'
    expect(result.items[1].reason).toBe('Ajuste de quantidade digitada errada');

    expect(result.items[2].id).toBe('run:run-1');
    expect(result.items[2].eventType).toBe('IMPORT_COMPLETED');
    expect(result.items[2].actor).toBeNull(); // runs do not invent actor
    expect(result.items[2].description).toContain('10 registros confirmados');
  });

  it('preserves deterministic sort on identical timestamps (tie-break by id DESC)', async () => {
    const t = new Date('2026-10-15T12:00:00.000Z');

    const rectA: TransactionRectificationRow = {
      id: 'rect-aaa',
      portfolioId,
      originalTransactionId: 'tx-1',
      compensatingTransactionId: 'tx-2',
      replacementTransactionId: null,
      mode: 'CANCEL',
      reason: 'Cancelamento',
      decidedByPrincipal: currentUserId,
      decidedAt: t,
      createdAt: t,
    };

    const rectB: TransactionRectificationRow = {
      id: 'rect-zzz',
      portfolioId,
      originalTransactionId: 'tx-3',
      compensatingTransactionId: 'tx-4',
      replacementTransactionId: null,
      mode: 'CANCEL',
      reason: 'Cancelamento',
      decidedByPrincipal: currentUserId,
      decidedAt: t,
      createdAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      rectifications: [rectA, rectB],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 10 },
    );

    expect(result.items).toHaveLength(2);
    // 'rect:rect-zzz' > 'rect:rect-aaa'
    expect(result.items[0].id).toBe('rect:rect-zzz');
    expect(result.items[1].id).toBe('rect:rect-aaa');
  });

  it('paginates deterministically across sources with zero duplicates and zero gaps', async () => {
    const items: TransactionRectificationRow[] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(`2026-10-15T10:0${i}:00.000Z`);
      items.push({
        id: `rect-${i}`,
        portfolioId,
        originalTransactionId: `tx-${i}`,
        compensatingTransactionId: `comp-${i}`,
        replacementTransactionId: `repl-${i}`,
        mode: 'RECTIFY',
        reason: `Motivo ${i}`,
        decidedByPrincipal: currentUserId,
        decidedAt: d,
        createdAt: d,
      });
    }

    const { rectRepo, decRepo, runRepo } = createMockRepos({ rectifications: items });

    // Page 1: limit 2 -> items 5 and 4
    const page1 = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 2 },
    );

    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].id).toBe('rect:rect-5');
    expect(page1.items[1].id).toBe('rect:rect-4');
    expect(page1.meta.hasMore).toBe(true);
    expect(page1.meta.nextCursor).toBeTruthy();

    // Page 2: with cursor from page 1 -> items 3 and 2
    const page2 = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 2, cursor: page1.meta.nextCursor },
    );

    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).toBe('rect:rect-3');
    expect(page2.items[1].id).toBe('rect:rect-2');
    expect(page2.meta.hasMore).toBe(true);

    // Page 3: with cursor from page 2 -> item 1
    const page3 = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 2, cursor: page2.meta.nextCursor },
    );

    expect(page3.items).toHaveLength(1);
    expect(page3.items[0].id).toBe('rect:rect-1');
    expect(page3.meta.hasMore).toBe(false);
    expect(page3.meta.nextCursor).toBeNull();
  });

  it('filters by category accurately without querying irrelevant sources', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');

    const rect: TransactionRectificationRow = {
      id: 'rect-1',
      portfolioId,
      originalTransactionId: 'tx-1',
      compensatingTransactionId: 'comp-1',
      replacementTransactionId: null,
      mode: 'RECTIFY',
      reason: 'Teste',
      decidedByPrincipal: currentUserId,
      decidedAt: t,
      createdAt: t,
    };

    const run: IntegrationRunRow = {
      id: 'run-1',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: null,
      sourceAsOf: null,
      status: 'COMPLETED',
      recordsFetched: 5,
      recordsNormalized: 5,
      newCandidates: 5,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      confirmed: 5,
      ignored: 0,
      reconciliation: null,
      partial: false,
      errorCode: null,
      errorMessage: null,
      trigger: 'MANUAL',
      startedAt: t,
      completedAt: t,
      createdAt: t,
      updatedAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      rectifications: [rect],
      runs: [run],
    });

    const resOnlyImports = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, category: 'IMPORTS' },
    );

    expect(resOnlyImports.items).toHaveLength(1);
    expect(resOnlyImports.items[0].eventType).toBe('IMPORT_COMPLETED');

    const resOnlyRects = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, category: 'RECTIFICATIONS' },
    );

    expect(resOnlyRects.items).toHaveLength(1);
    expect(resOnlyRects.items[0].eventType).toBe('TRANSACTION_RECTIFIED');
  });

  it('never leaks raw principal IDs in responses or payloads', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');
    const secretPrincipalId = 'usr_uuid_very_secret_9876543210';

    const rect: TransactionRectificationRow = {
      id: 'rect-1',
      portfolioId,
      originalTransactionId: 'tx-1',
      compensatingTransactionId: 'comp-1',
      replacementTransactionId: null,
      mode: 'RECTIFY',
      reason: 'Correção',
      decidedByPrincipal: secretPrincipalId,
      decidedAt: t,
      createdAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ rectifications: [rect] });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 10 },
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secretPrincipalId);
    expect(result.items[0].actor?.label).toBe('Usuário');
  });

  it('handles legacy records with missing or empty actor safely', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');

    const rect: TransactionRectificationRow = {
      id: 'rect-1',
      portfolioId,
      originalTransactionId: 'tx-1',
      compensatingTransactionId: 'comp-1',
      replacementTransactionId: null,
      mode: 'RECTIFY',
      reason: '',
      decidedByPrincipal: '',
      decidedAt: t,
      createdAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ rectifications: [rect] });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 10 },
    );

    expect(result.items[0].actor).toBeNull();
    expect(result.items[0].reason).toBeNull();
  });

  it('audits full rectification chains A -> B -> C as separate distinct events without collapsing', async () => {
    const tA = new Date('2026-10-15T10:00:00.000Z');
    const tB = new Date('2026-10-15T11:00:00.000Z');

    const rectA: TransactionRectificationRow = {
      id: 'rect-1',
      portfolioId,
      originalTransactionId: 'tx-A',
      compensatingTransactionId: 'tx-A-comp',
      replacementTransactionId: 'tx-B',
      mode: 'RECTIFY',
      reason: 'Primeira correção: preço unitário',
      decidedByPrincipal: currentUserId,
      decidedAt: tA,
      createdAt: tA,
    };

    const rectB: TransactionRectificationRow = {
      id: 'rect-2',
      portfolioId,
      originalTransactionId: 'tx-B',
      compensatingTransactionId: 'tx-B-comp',
      replacementTransactionId: 'tx-C',
      mode: 'RECTIFY',
      reason: 'Segunda correção: quantidade',
      decidedByPrincipal: currentUserId,
      decidedAt: tB,
      createdAt: tB,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ rectifications: [rectA, rectB] });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 10 },
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('rect:rect-2');
    expect(result.items[0].reason).toBe('Segunda correção: quantidade');
    expect(result.items[1].id).toBe('rect:rect-1');
    expect(result.items[1].reason).toBe('Primeira correção: preço unitário');
  });

  it('maps different integration run statuses (FAILED, PARTIAL, AWAITING_REVIEW) accurately', async () => {
    const t1 = new Date('2026-10-15T10:00:00.000Z');
    const t2 = new Date('2026-10-15T11:00:00.000Z');
    const t3 = new Date('2026-10-15T12:00:00.000Z');

    const runFailed: IntegrationRunRow = {
      id: 'run-failed',
      portfolioId,
      source: 'B3',
      provider: 'API',
      environment: 'PROD',
      fileName: null,
      sourceAsOf: null,
      status: 'FAILED',
      recordsFetched: 0,
      recordsNormalized: 0,
      newCandidates: 0,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      confirmed: 0,
      ignored: 0,
      reconciliation: null,
      partial: false,
      errorCode: 'PROVIDER_TIMEOUT',
      errorMessage: 'Tempo limite esgotado no provedor B3',
      trigger: 'SCHEDULED',
      startedAt: t1,
      completedAt: t1,
      createdAt: t1,
      updatedAt: t1,
    };

    const runPartial: IntegrationRunRow = {
      id: 'run-partial',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: 'notas.csv',
      sourceAsOf: null,
      status: 'PARTIAL',
      recordsFetched: 10,
      recordsNormalized: 8,
      newCandidates: 8,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 2,
      invalid: 0,
      confirmed: 8,
      ignored: 0,
      reconciliation: null,
      partial: true,
      errorCode: null,
      errorMessage: null,
      trigger: 'MANUAL',
      startedAt: t2,
      completedAt: t2,
      createdAt: t2,
      updatedAt: t2,
    };

    const runReview: IntegrationRunRow = {
      id: 'run-review',
      portfolioId,
      source: 'B3',
      provider: 'API',
      environment: 'PROD',
      fileName: null,
      sourceAsOf: null,
      status: 'AWAITING_REVIEW',
      recordsFetched: 15,
      recordsNormalized: 15,
      newCandidates: 15,
      exactDuplicates: 0,
      probableDuplicates: 2,
      conflicts: 1,
      unsupported: 0,
      invalid: 0,
      confirmed: 12,
      ignored: 0,
      reconciliation: null,
      partial: false,
      errorCode: null,
      errorMessage: null,
      trigger: 'SCHEDULED',
      startedAt: t3,
      completedAt: null,
      createdAt: t3,
      updatedAt: t3,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      runs: [runFailed, runPartial, runReview],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 10 },
    );

    expect(result.items).toHaveLength(3);

    // t3 (run-review)
    expect(result.items[0].eventType).toBe('IMPORT_AWAITING_REVIEW');
    expect(result.items[0].actor?.label).toBe('Sistema'); // trigger: SCHEDULED
    expect(result.items[0].entity?.type).toBe('REVIEW');
    expect(result.items[0].entity?.routeHref).toBe('/reviews/run-review');

    // t2 (run-partial)
    expect(result.items[1].eventType).toBe('IMPORT_PARTIAL');
    expect(result.items[1].description).toContain('parcialmente');

    // t1 (run-failed)
    expect(result.items[2].eventType).toBe('IMPORT_FAILED');
    expect(result.items[2].reason).toBe('Tempo limite esgotado no provedor B3');
    expect(result.items[2].description).toContain('falhou: Tempo limite esgotado no provedor B3');
  });
});
