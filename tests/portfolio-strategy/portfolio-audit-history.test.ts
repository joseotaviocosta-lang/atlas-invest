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

describe('Operational Audit History Composition (Phase 5S-E-R1)', () => {
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
        let filtered = runs.filter(
          (r) => ['COMPLETED', 'PARTIAL', 'FAILED'].includes(r.status) && r.completedAt !== null,
        );
        const cursorDate = opts.cursor?.completedAt ?? opts.cursor?.createdAt;
        if (cursorDate) {
          filtered = filtered.filter((r) => r.completedAt! <= cursorDate);
        }
        filtered.sort(
          (a, b) => b.completedAt!.getTime() - a.completedAt!.getTime() || b.id.localeCompare(a.id),
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
      decidedByPrincipal: 'operator:op-456',
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
    expect(result.items[0].actor?.label).toBe('Operador');
    expect(result.items[0].description).toBe('Correspondência de importação confirmada.');
    expect(result.items[0].metadata?.decision).toBe('CONFIRM_MATCH');

    expect(result.items[1].id).toBe('rect:rect-1');
    expect(result.items[1].eventType).toBe('TRANSACTION_RECTIFIED');
    expect(result.items[1].actor?.label).toBe('Você'); // current user mapped to 'Você'
    expect(result.items[1].reason).toBe('Ajuste de quantidade digitada errada');

    expect(result.items[2].id).toBe('run:run-1');
    expect(result.items[2].eventType).toBe('IMPORT_COMPLETED');
    expect(result.items[2].actor).toBeNull(); // manual run without user id does not invent actor
    expect(result.items[2].description).toContain('10 registros confirmados');
  });

  it('Step 31: maps COMPLETED integration run to IMPORT_COMPLETED', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');
    const run: IntegrationRunRow = {
      id: 'run-comp',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: 'notas.csv',
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
      startedAt: t,
      completedAt: t,
      createdAt: t,
      updatedAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [run] });
    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventType).toBe('IMPORT_COMPLETED');
    expect(result.items[0].title).toBe('Importação concluída');
  });

  it('Step 32: maps PARTIAL integration run to IMPORT_PARTIAL with accurate title and copy', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');
    const run: IntegrationRunRow = {
      id: 'run-part',
      portfolioId,
      source: 'B3',
      provider: 'API',
      environment: 'PROD',
      fileName: null,
      sourceAsOf: null,
      status: 'PARTIAL',
      recordsFetched: 15,
      recordsNormalized: 10,
      newCandidates: 10,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 5,
      invalid: 0,
      confirmed: 10,
      ignored: 0,
      reconciliation: null,
      partial: true,
      errorCode: 'UNSUPPORTED_EVENTS',
      errorMessage: null,
      trigger: 'SCHEDULED',
      startedAt: t,
      completedAt: t,
      createdAt: t,
      updatedAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [run] });
    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventType).toBe('IMPORT_PARTIAL');
    expect(result.items[0].title).toBe('Importação concluída parcialmente');
    expect(result.items[0].description).toContain('parcialmente');
    expect(result.items[0].actor?.label).toBe('Sistema'); // trigger: SCHEDULED
  });

  it('Step 33: maps FAILED integration run to IMPORT_FAILED without success language', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');
    const run: IntegrationRunRow = {
      id: 'run-fail',
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
      errorCode: 'TIMEOUT',
      errorMessage: 'Tempo esgotado na conexão com B3',
      trigger: 'SCHEDULED',
      startedAt: t,
      completedAt: t,
      createdAt: t,
      updatedAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [run] });
    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventType).toBe('IMPORT_FAILED');
    expect(result.items[0].title).toBe('Importação não concluída');
    expect(result.items[0].description).toBe('A importação via B3 falhou.');
    expect(result.items[0].reason).toContain('TIMEOUT');
  });

  it('Step 34: does NOT synthesize start events for non-terminal runs', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');
    const runStarted: IntegrationRunRow = {
      id: 'run-started',
      portfolioId,
      source: 'B3',
      provider: 'API',
      environment: 'PROD',
      fileName: null,
      sourceAsOf: null,
      status: 'STARTED',
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
      errorCode: null,
      errorMessage: null,
      trigger: 'MANUAL',
      startedAt: t,
      completedAt: null,
      createdAt: t,
      updatedAt: t,
    };

    const runReview: IntegrationRunRow = {
      id: 'run-review',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: 'notas.csv',
      sourceAsOf: null,
      status: 'AWAITING_REVIEW',
      recordsFetched: 5,
      recordsNormalized: 5,
      newCandidates: 5,
      exactDuplicates: 0,
      probableDuplicates: 1,
      conflicts: 1,
      unsupported: 0,
      invalid: 0,
      confirmed: 3,
      ignored: 0,
      reconciliation: null,
      partial: false,
      errorCode: null,
      errorMessage: null,
      trigger: 'MANUAL',
      startedAt: t,
      completedAt: null,
      createdAt: t,
      updatedAt: t,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [runStarted, runReview] });
    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    // Both in-flight/review runs are skipped; zero synthetic events produced
    expect(result.items).toHaveLength(0);
  });

  it('Step 35: asserts reconciliation metadata matches persisted decision enum and display copy', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');

    const decMatch: ReconciliationDecisionRow = {
      id: 'dec-match',
      portfolioId,
      integrationRunId: 'run-1',
      source: 'B3',
      sourceItemKey: 'item-1',
      localTransactionId: 'tx-1',
      decision: 'CONFIRM_MATCH',
      decidedByPrincipal: currentUserId,
      decidedAt: t,
      createdAt: t,
    };

    const decNonMatch: ReconciliationDecisionRow = {
      id: 'dec-non-match',
      portfolioId,
      integrationRunId: 'run-1',
      source: 'B3',
      sourceItemKey: 'item-2',
      localTransactionId: 'tx-2',
      decision: 'NOT_A_MATCH',
      decidedByPrincipal: currentUserId,
      decidedAt: new Date(t.getTime() - 1000),
      createdAt: new Date(t.getTime() - 1000),
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      decisions: [decMatch, decNonMatch],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    expect(result.items).toHaveLength(2);

    expect(result.items[0].metadata?.decision).toBe('CONFIRM_MATCH');
    expect(result.items[0].reason).toBe('Correspondência confirmada');

    expect(result.items[1].metadata?.decision).toBe('NOT_A_MATCH');
    expect(result.items[1].reason).toBe('Marcado como não correspondente');
  });

  it('Step 36 & 37 & 38: attributes current user to Você, null actor to null, and never false system', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');

    const rectUser: TransactionRectificationRow = {
      id: 'rect-user',
      portfolioId,
      originalTransactionId: 'tx-1',
      compensatingTransactionId: 'comp-1',
      replacementTransactionId: null,
      mode: 'CANCEL',
      reason: 'Cancelado pelo usuário',
      decidedByPrincipal: currentUserId,
      decidedAt: t,
      createdAt: t,
    };

    const rectUnknown: TransactionRectificationRow = {
      id: 'rect-unknown',
      portfolioId,
      originalTransactionId: 'tx-2',
      compensatingTransactionId: 'comp-2',
      replacementTransactionId: null,
      mode: 'CANCEL',
      reason: 'Cancelado sem autor conhecido',
      decidedByPrincipal: '',
      decidedAt: new Date(t.getTime() - 1000),
      createdAt: new Date(t.getTime() - 1000),
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      rectifications: [rectUser, rectUnknown],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    expect(result.items[0].actor?.label).toBe('Você');
    expect(result.items[1].actor).toBeNull(); // Does NOT become 'Sistema'
  });

  it('Step 39: never leaks raw principal IDs in output JSON', async () => {
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
    expect(result.items[0].actor).toBeNull();
  });

  it('Step 41 & 42: globally sorts mixed events by occurredAt DESC with deterministic id tie-break', async () => {
    const t1 = new Date('2026-10-15T10:00:00.000Z');
    const t2 = new Date('2026-10-15T11:00:00.000Z');
    const tSame = new Date('2026-10-15T12:00:00.000Z');

    const runFail: IntegrationRunRow = {
      id: 'run-fail',
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
      errorCode: 'TIMEOUT',
      errorMessage: null,
      trigger: 'SCHEDULED',
      startedAt: t1,
      completedAt: t1,
      createdAt: t1,
      updatedAt: t1,
    };

    const runPartial: IntegrationRunRow = {
      id: 'run-partial',
      portfolioId,
      source: 'B3',
      provider: 'API',
      environment: 'PROD',
      fileName: null,
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

    const rectSameA: TransactionRectificationRow = {
      id: 'rect-aaa',
      portfolioId,
      originalTransactionId: 'tx-1',
      compensatingTransactionId: 'comp-1',
      replacementTransactionId: null,
      mode: 'CANCEL',
      reason: 'Cancelamento A',
      decidedByPrincipal: currentUserId,
      decidedAt: tSame,
      createdAt: tSame,
    };

    const rectSameZ: TransactionRectificationRow = {
      id: 'rect-zzz',
      portfolioId,
      originalTransactionId: 'tx-2',
      compensatingTransactionId: 'comp-2',
      replacementTransactionId: null,
      mode: 'CANCEL',
      reason: 'Cancelamento Z',
      decidedByPrincipal: currentUserId,
      decidedAt: tSame,
      createdAt: tSame,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      rectifications: [rectSameA, rectSameZ],
      runs: [runFail, runPartial],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId },
    );

    expect(result.items).toHaveLength(4);
    // At tSame: id 'rect:rect-zzz' comes before 'rect:rect-aaa'
    expect(result.items[0].id).toBe('rect:rect-zzz');
    expect(result.items[1].id).toBe('rect:rect-aaa');
    // At t2: run-partial
    expect(result.items[2].id).toBe('run:run-partial');
    // At t1: run-fail
    expect(result.items[3].id).toBe('run:run-fail');
  });

  it('Step 43: paginates across mixed sources with zero duplicates and zero gaps', async () => {
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

    // Page 1: limit 2
    const page1 = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 2 },
    );

    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].id).toBe('rect:rect-5');
    expect(page1.items[1].id).toBe('rect:rect-4');
    expect(page1.meta.hasMore).toBe(true);

    // Page 2
    const page2 = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 2, cursor: page1.meta.nextCursor },
    );

    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).toBe('rect:rect-3');
    expect(page2.items[1].id).toBe('rect:rect-2');
    expect(page2.meta.hasMore).toBe(true);

    // Page 3
    const page3 = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 2, cursor: page2.meta.nextCursor },
    );

    expect(page3.items).toHaveLength(1);
    expect(page3.items[0].id).toBe('rect:rect-1');
    expect(page3.meta.hasMore).toBe(false);
  });

  it('Step 44: category filter IMPORTS returns COMPLETED, PARTIAL, and FAILED without separate tabs', async () => {
    const t1 = new Date('2026-10-15T10:00:00.000Z');
    const t2 = new Date('2026-10-15T11:00:00.000Z');
    const t3 = new Date('2026-10-15T12:00:00.000Z');

    const runComp: IntegrationRunRow = {
      id: 'run-c',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: 'notas.csv',
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
      startedAt: t3,
      completedAt: t3,
      createdAt: t3,
      updatedAt: t3,
    };

    const runPart: IntegrationRunRow = {
      id: 'run-p',
      portfolioId,
      source: 'CEI_CSV',
      provider: 'MANUAL',
      environment: 'PROD',
      fileName: null,
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

    const runFail: IntegrationRunRow = {
      id: 'run-f',
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
      errorCode: 'NET_ERR',
      errorMessage: null,
      trigger: 'SCHEDULED',
      startedAt: t1,
      completedAt: t1,
      createdAt: t1,
      updatedAt: t1,
    };

    const { rectRepo, decRepo, runRepo } = createMockRepos({
      runs: [runComp, runPart, runFail],
    });

    const result = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, category: 'IMPORTS' },
    );

    expect(result.items).toHaveLength(3);
    const eventTypes = result.items.map((i) => i.eventType);
    expect(eventTypes).toContain('IMPORT_COMPLETED');
    expect(eventTypes).toContain('IMPORT_PARTIAL');
    expect(eventTypes).toContain('IMPORT_FAILED');
  });

  it('Step 45: supports operations preview composition with limit <= 5', async () => {
    const t = new Date('2026-10-15T10:00:00.000Z');
    const items: TransactionRectificationRow[] = [];
    for (let i = 1; i <= 8; i++) {
      items.push({
        id: `rect-${i}`,
        portfolioId,
        originalTransactionId: `tx-${i}`,
        compensatingTransactionId: `comp-${i}`,
        replacementTransactionId: null,
        mode: 'RECTIFY',
        reason: `Motivo ${i}`,
        decidedByPrincipal: currentUserId,
        decidedAt: new Date(t.getTime() + i * 1000),
        createdAt: new Date(t.getTime() + i * 1000),
      });
    }

    const { rectRepo, decRepo, runRepo } = createMockRepos({ rectifications: items });

    const preview = await composePortfolioAuditHistory(
      { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
      { portfolioId, currentUserId, limit: 5 },
    );

    expect(preview.items).toHaveLength(5);
    expect(preview.meta.limit).toBe(5);
  });

  describe('Phase 5S-E-R2: Terminal Timestamp Fidelity', () => {
    const tCreated = new Date('2026-10-15T10:00:00.000Z');
    const tCompleted = new Date('2026-10-15T10:30:00.000Z');

    it('Step 16: COMPLETED integration run strictly uses completedAt, not createdAt', async () => {
      const run: IntegrationRunRow = {
        id: 'run-c',
        portfolioId,
        source: 'CEI_CSV',
        provider: 'MANUAL',
        environment: 'PROD',
        fileName: 'notas.csv',
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
        startedAt: tCreated,
        completedAt: tCompleted,
        createdAt: tCreated,
        updatedAt: tCompleted,
      };

      const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [run] });
      const result = await composePortfolioAuditHistory(
        { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
        { portfolioId, currentUserId },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].occurredAt).toBe(tCompleted.toISOString());
      expect(result.items[0].occurredAt).not.toBe(tCreated.toISOString());
    });

    it('Step 17: PARTIAL integration run strictly uses completedAt, not createdAt', async () => {
      const run: IntegrationRunRow = {
        id: 'run-p',
        portfolioId,
        source: 'B3',
        provider: 'API',
        environment: 'PROD',
        fileName: null,
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
        startedAt: tCreated,
        completedAt: tCompleted,
        createdAt: tCreated,
        updatedAt: tCompleted,
      };

      const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [run] });
      const result = await composePortfolioAuditHistory(
        { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
        { portfolioId, currentUserId },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].occurredAt).toBe(tCompleted.toISOString());
      expect(result.items[0].occurredAt).not.toBe(tCreated.toISOString());
    });

    it('Step 18: FAILED integration run strictly uses completedAt, not createdAt', async () => {
      const run: IntegrationRunRow = {
        id: 'run-f',
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
        errorCode: 'TIMEOUT',
        errorMessage: 'Network timeout',
        trigger: 'SCHEDULED',
        startedAt: tCreated,
        completedAt: tCompleted,
        createdAt: tCreated,
        updatedAt: tCompleted,
      };

      const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [run] });
      const result = await composePortfolioAuditHistory(
        { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
        { portfolioId, currentUserId },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].occurredAt).toBe(tCompleted.toISOString());
      expect(result.items[0].occurredAt).not.toBe(tCreated.toISOString());
    });

    it('Step 19: terminal integration run lacking completedAt is omitted (never fabricates completion time)', async () => {
      const runLegacy: IntegrationRunRow = {
        id: 'run-legacy-no-completed',
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
        errorCode: 'UNKNOWN',
        errorMessage: null,
        trigger: 'MANUAL',
        startedAt: tCreated,
        completedAt: null, // Legacy row lacking terminal timestamp
        createdAt: tCreated,
        updatedAt: tCreated,
      };

      const { rectRepo, decRepo, runRepo } = createMockRepos({ runs: [runLegacy] });
      const result = await composePortfolioAuditHistory(
        { rectifications: rectRepo, decisions: decRepo, runs: runRepo },
        { portfolioId, currentUserId },
      );

      // Must be omitted from chronological feed; createdAt must NEVER be fabricated as terminal time
      expect(result.items).toHaveLength(0);
    });
  });
});
