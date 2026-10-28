import type {
  IAssetRepository,
  IIntegrationRunRepository,
  ITransactionRectificationRepository,
  ITransactionRepository,
  IReconciliationDecisionRepository,
  TransactionRectificationRow,
  ReconciliationDecisionRow,
  IntegrationRunRow,
} from '@atlas/database';
import type {
  ComposeAuditHistoryParams,
  OperationalAuditActor,
  OperationalAuditEventType,
  OperationalAuditHistoryResult,
  OperationalAuditItem,
} from './portfolio-audit-history.types';

export interface AuditHistoryComposeDependencies {
  rectifications: ITransactionRectificationRepository;
  decisions: IReconciliationDecisionRepository;
  runs: IIntegrationRunRepository;
  transactions?: ITransactionRepository;
  assets?: IAssetRepository;
}

export function parseAuditCursor(
  cursorStr?: string | null,
): { occurredAt: Date; id: string } | null {
  if (!cursorStr) return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.at === 'string' && typeof parsed.id === 'string') {
      const at = new Date(parsed.at);
      if (!isNaN(at.getTime())) {
        return { occurredAt: at, id: parsed.id };
      }
    }
  } catch {
    // Malformed cursor returns null
  }
  return null;
}

export function encodeAuditCursor(item: OperationalAuditItem): string {
  return Buffer.from(
    JSON.stringify({
      at: item.occurredAt,
      id: item.id,
    }),
  ).toString('base64url');
}

export function mapAuditActor(
  decidedByPrincipal: string | null | undefined,
  currentUserId: string,
): OperationalAuditActor | null {
  if (!decidedByPrincipal || !decidedByPrincipal.trim()) {
    return null;
  }
  const trimmed = decidedByPrincipal.trim();
  if (trimmed === currentUserId || trimmed === `user:${currentUserId}`) {
    return { kind: 'USER', label: 'Você' };
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'system' || lower === 'cron' || lower === 'scheduler') {
    return { kind: 'SYSTEM', label: 'Sistema' };
  }
  if (lower.startsWith('op_') || lower.startsWith('operator:')) {
    return { kind: 'OPERATOR', label: 'Operador' };
  }
  return null;
}

export async function composePortfolioAuditHistory(
  deps: AuditHistoryComposeDependencies,
  params: ComposeAuditHistoryParams,
): Promise<OperationalAuditHistoryResult> {
  const { portfolioId, currentUserId } = params;
  const category = params.category ?? 'ALL';
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit ?? 25)));
  const parsedCursor = parseAuditCursor(params.cursor);

  // Queries are bounded by source.
  // Take limit + 1 from each active source to detect hasMore and ensure global top-N coverage.
  const takePerSource = limit + 1;

  const shouldFetchRectifications = category === 'ALL' || category === 'RECTIFICATIONS';
  const shouldFetchDecisions = category === 'ALL' || category === 'RECONCILIATIONS';
  const shouldFetchRuns = category === 'ALL' || category === 'IMPORTS';

  const [rectRows, decRows, runRows] = await Promise.all([
    shouldFetchRectifications
      ? deps.rectifications.listByPortfolio(portfolioId, {
          limit: takePerSource,
          cursor: parsedCursor ? { decidedAt: parsedCursor.occurredAt } : null,
        })
      : Promise.resolve([] as TransactionRectificationRow[]),
    shouldFetchDecisions
      ? deps.decisions.listByPortfolio(portfolioId, {
          limit: takePerSource,
          cursor: parsedCursor ? { decidedAt: parsedCursor.occurredAt } : null,
        })
      : Promise.resolve([] as ReconciliationDecisionRow[]),
    shouldFetchRuns
      ? deps.runs.listForAudit(portfolioId, {
          limit: takePerSource,
          cursor: parsedCursor ? { completedAt: parsedCursor.occurredAt } : null,
        })
      : Promise.resolve([] as IntegrationRunRow[]),
  ]);

  // Batch-resolve transaction and asset tickers (No N+1)
  const txIdsToLoad = new Set<string>();
  for (const r of rectRows) {
    txIdsToLoad.add(r.originalTransactionId);
    if (r.replacementTransactionId) {
      txIdsToLoad.add(r.replacementTransactionId);
    }
  }
  for (const d of decRows) {
    txIdsToLoad.add(d.localTransactionId);
  }

  const txMap = new Map<string, { id: string; assetId?: string }>();
  const assetMap = new Map<string, { id: string; ticker: string }>();

  if (deps.transactions && txIdsToLoad.size > 0) {
    try {
      const txs = await deps.transactions.findByIds(Array.from(txIdsToLoad));
      const assetIdsToLoad = new Set<string>();
      for (const tx of txs) {
        const assetId = 'assetId' in tx && typeof tx.assetId === 'string' ? tx.assetId : undefined;
        txMap.set(tx.id, { id: tx.id, assetId });
        if (assetId) {
          assetIdsToLoad.add(assetId);
        }
      }
      if (deps.assets && assetIdsToLoad.size > 0) {
        const assets = await deps.assets.findByIds(Array.from(assetIdsToLoad));
        for (const a of assets) {
          assetMap.set(a.id, { id: a.id, ticker: a.ticker });
        }
      }
    } catch {
      // Graceful fallback if transaction/asset lookup fails
    }
  }

  const items: OperationalAuditItem[] = [];

  // Map Rectifications
  for (const r of rectRows) {
    const origTx = txMap.get(r.originalTransactionId);
    const asset = origTx?.assetId ? assetMap.get(origTx.assetId) : undefined;
    const ticker = asset?.ticker;
    const isCancel = r.mode === 'CANCEL';

    const title = isCancel ? 'Operação cancelada' : 'Operação retificada';
    const description = ticker
      ? `Uma operação de ${ticker} foi ${isCancel ? 'cancelada' : 'retificada'}.`
      : `Uma operação foi ${isCancel ? 'cancelada' : 'retificada'}.`;

    const targetTxId = r.replacementTransactionId ?? r.originalTransactionId;

    items.push({
      id: `rect:${r.id}`,
      eventType: 'TRANSACTION_RECTIFIED',
      category: 'RECTIFICATIONS',
      source: 'TRANSACTION_RECTIFICATION',
      portfolioId,
      occurredAt: r.decidedAt.toISOString(),
      title,
      description,
      actor: mapAuditActor(r.decidedByPrincipal, currentUserId),
      entity: {
        type: 'TRANSACTION',
        id: targetTxId,
        label: 'Ver operação',
        routeHref: `/portfolio?portfolioId=${portfolioId}&tab=operations&transactionId=${targetTxId}`,
      },
      reason: r.reason ? r.reason.trim() : null,
      metadata: {
        mode: r.mode,
        originalTransactionId: r.originalTransactionId,
        replacementTransactionId: r.replacementTransactionId,
      },
    });
  }

  // Map Reconciliation Decisions
  for (const d of decRows) {
    const tx = txMap.get(d.localTransactionId);
    const asset = tx?.assetId ? assetMap.get(tx.assetId) : undefined;
    const ticker = asset?.ticker;

    const isMatch = d.decision === 'CONFIRM_MATCH';
    const title = 'Reconciliação revisada';
    const description = isMatch
      ? ticker
        ? `Correspondência de importação confirmada para ${ticker}.`
        : 'Correspondência de importação confirmada.'
      : ticker
        ? `Item de importação marcado como não correspondente para ${ticker}.`
        : 'Item de importação marcado como não correspondente.';

    items.push({
      id: `decision:${d.id}`,
      eventType: 'RECONCILIATION_DECISION_RECORDED',
      category: 'RECONCILIATIONS',
      source: 'RECONCILIATION_DECISION',
      portfolioId,
      occurredAt: d.decidedAt.toISOString(),
      title,
      description,
      actor: mapAuditActor(d.decidedByPrincipal, currentUserId),
      entity: {
        type: 'REVIEW',
        id: d.integrationRunId,
        label: 'Ver revisão',
        routeHref: `/reviews/${d.integrationRunId}`,
      },
      reason: isMatch ? 'Correspondência confirmada' : 'Marcado como não correspondente',
      metadata: {
        decision: d.decision,
        source: d.source,
        integrationRunId: d.integrationRunId,
        localTransactionId: d.localTransactionId,
      },
    });
  }

  // Map Integration Runs
  for (const run of runRows) {
    // Phase 5S-E-R2: Terminal Timestamp Fidelity.
    // Every terminal event MUST have a factual completion timestamp.
    // If completedAt is missing (e.g. legacy/corrupt row), omit the row from chronological feed.
    // Never fallback to createdAt as a substitute for completion time.
    if (!run.completedAt) {
      continue;
    }

    const status = run.status.toUpperCase();
    let eventType: OperationalAuditEventType;
    let title: string;
    let description: string;
    let reason: string | null = null;

    if (status === 'COMPLETED') {
      eventType = 'IMPORT_COMPLETED';
      title = 'Importação concluída';
      description = `A importação via ${run.source} terminou com ${run.confirmed} registros confirmados.${
        run.fileName ? ` (Arquivo: ${run.fileName})` : ''
      }`;
    } else if (status === 'PARTIAL') {
      eventType = 'IMPORT_PARTIAL';
      title = 'Importação concluída parcialmente';
      description = `A importação via ${run.source} foi processada parcialmente com ${run.confirmed} registros confirmados.`;
      if (run.errorCode) {
        reason = `Código: ${run.errorCode}`;
      }
    } else if (status === 'FAILED') {
      eventType = 'IMPORT_FAILED';
      title = 'Importação não concluída';
      description = `A importação via ${run.source} falhou.`;
      if (run.errorCode) {
        reason = `Falha (${run.errorCode})${run.errorMessage ? `: ${run.errorMessage.slice(0, 150)}` : ''}`;
      } else if (run.errorMessage) {
        reason = run.errorMessage.slice(0, 150);
      }
    } else {
      // Non-terminal runs (STARTED, AWAITING_REVIEW, CONFIRMING, etc.) are in-flight
      // and do not represent a terminal/completed operational change event.
      continue;
    }

    const occurredAtDate = run.completedAt;
    const entity = {
      type: 'INTEGRATION_RUN' as const,
      id: run.id,
      label: 'Ver execução',
      routeHref: `/portfolio/import?portfolioId=${portfolioId}&runId=${run.id}`,
    };

    const actor: OperationalAuditActor | null =
      run.trigger === 'SCHEDULED' ? { kind: 'SYSTEM', label: 'Sistema' } : null;

    items.push({
      id: `run:${run.id}`,
      eventType,
      category: 'IMPORTS',
      source: 'INTEGRATION_RUN',
      portfolioId,
      occurredAt: occurredAtDate.toISOString(),
      title,
      description,
      actor,
      entity,
      reason,
      metadata: {
        source: run.source,
        provider: run.provider,
        status: run.status,
        recordsFetched: run.recordsFetched,
        confirmed: run.confirmed,
        errorCode: run.errorCode ?? undefined,
      },
    });
  }

  // Filter out any items preceding or equal to cursor on tie-break
  const candidateItems = parsedCursor
    ? items.filter((item) => {
        const timeItem = new Date(item.occurredAt).getTime();
        const timeCursor = parsedCursor.occurredAt.getTime();
        if (timeItem < timeCursor) return true;
        if (timeItem === timeCursor) return item.id.localeCompare(parsedCursor.id) < 0;
        return false;
      })
    : items;

  // Stable deterministic multi-source global sort:
  // 1. occurredAt DESC
  // 2. id DESC
  candidateItems.sort((a, b) => {
    const timeA = new Date(a.occurredAt).getTime();
    const timeB = new Date(b.occurredAt).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return b.id.localeCompare(a.id);
  });

  const hasMore =
    candidateItems.length > limit ||
    rectRows.length > limit ||
    decRows.length > limit ||
    runRows.length > limit;

  const pageItems = candidateItems.slice(0, limit);
  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor = hasMore && lastItem ? encodeAuditCursor(lastItem) : null;

  return {
    items: pageItems,
    meta: {
      limit,
      cursor: params.cursor ?? null,
      nextCursor,
      hasMore,
      totalItemsInPage: pageItems.length,
    },
  };
}
