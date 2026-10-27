import type { ITransactionRectificationRepository } from '@atlas/database';

export interface RectificationBadge {
  status: 'SUPERSEDED' | 'CORRECTION';
  replacementTransactionId: string | null;
  originalTransactionId: string | null;
  reason: string | null;
  decidedAt: string;
}

export interface RectificationViewDeps {
  rectifications: ITransactionRectificationRepository;
}

/**
 * Phase 5S-C — shared read-only rectification views.
 *
 * Badges answer "is this transaction rectified / a correction?" for
 * lists and history rows. One batched lookup per call — never per
 * item. SUPERSEDED wins over CORRECTION for middle-of-chain nodes so
 * navigation always moves forward to the current effective
 * transaction. Ledger semantics are untouched: the replay already
 * nets compensating and replacement legs.
 */
export async function attachRectificationBadges(
  deps: RectificationViewDeps,
  portfolioId: string,
  transactionIds: readonly string[],
): Promise<Map<string, RectificationBadge>> {
  const unique = [...new Set(transactionIds)];
  const badges = new Map<string, RectificationBadge>();
  if (unique.length === 0) return badges;
  const [asOriginal, asReplacement] = await Promise.all([
    deps.rectifications.listByOriginalTransactionIds(unique, portfolioId),
    deps.rectifications.listByReplacementTransactionIds(unique, portfolioId),
  ]);
  for (const link of asReplacement) {
    if (link.replacementTransactionId === null) continue;
    badges.set(link.replacementTransactionId, {
      status: 'CORRECTION',
      replacementTransactionId: null,
      originalTransactionId: link.originalTransactionId,
      reason: link.reason,
      decidedAt: link.decidedAt.toISOString(),
    });
  }
  for (const link of asOriginal) {
    badges.set(link.originalTransactionId, {
      status: 'SUPERSEDED',
      replacementTransactionId: link.replacementTransactionId,
      originalTransactionId: null,
      reason: link.reason,
      decidedAt: link.decidedAt.toISOString(),
    });
  }
  return badges;
}

export interface RectificationChainNode {
  transactionId: string;
  role: 'SUPERSEDED' | 'CORRECTION' | 'CURRENT';
  reason: string | null;
  decidedAt: string | null;
}

export interface RectificationChainView {
  status: 'SUPERSEDED' | 'CORRECTION' | 'CURRENT';
  effectiveTransactionId: string | null;
  chain: RectificationChainNode[];
}

/**
 * Full append-only chain containing one transaction, oldest first.
 * Untouched transactions resolve to CURRENT with an empty chain.
 * Bounded walk with cycle guard (cycles are impossible by
 * construction: every replacement is freshly created).
 */
export async function buildRectificationChain(
  deps: RectificationViewDeps,
  portfolioId: string,
  transactionId: string,
): Promise<RectificationChainView> {
  const backward: Array<{ id: string; reason: string; decidedAt: string }> = [];
  {
    let cursor: string | null = transactionId;
    const seen = new Set<string>([transactionId]);
    let guard = 0;
    while (cursor !== null && guard < 25) {
      guard += 1;
      const link = await deps.rectifications.findByReplacementTransactionId(cursor, portfolioId);
      if (!link || seen.has(link.originalTransactionId)) break;
      seen.add(link.originalTransactionId);
      backward.unshift({
        id: link.originalTransactionId,
        reason: link.reason,
        decidedAt: link.decidedAt.toISOString(),
      });
      cursor = link.originalTransactionId;
    }
  }

  const chain: RectificationChainNode[] = [];
  const seen = new Set<string>();
  for (const node of backward) {
    chain.push({
      transactionId: node.id,
      role: 'SUPERSEDED',
      reason: node.reason,
      decidedAt: node.decidedAt,
    });
    seen.add(node.id);
  }

  let probe: string | null = transactionId;
  let guard = 0;
  let lastReason: string | null = null;
  let lastDecidedAt: string | null = null;
  const incoming = await deps.rectifications.findByReplacementTransactionId(
    transactionId,
    portfolioId,
  );
  if (incoming) {
    lastReason = incoming.reason;
    lastDecidedAt = incoming.decidedAt.toISOString();
  }
  while (probe !== null && guard < 25) {
    guard += 1;
    if (seen.has(probe)) break;
    seen.add(probe);
    const link = await deps.rectifications.findByOriginalTransactionId(probe, portfolioId);
    if (!link) {
      chain.push({
        transactionId: probe,
        reason: lastReason,
        decidedAt: lastDecidedAt,
        role: lastReason !== null ? 'CORRECTION' : 'CURRENT',
      });
      probe = null;
    } else {
      chain.push({
        transactionId: probe,
        reason: link.reason,
        decidedAt: link.decidedAt.toISOString(),
        role: 'SUPERSEDED',
      });
      lastReason = link.reason;
      lastDecidedAt = link.decidedAt.toISOString();
      probe = link.replacementTransactionId;
    }
  }

  const status: RectificationChainView['status'] = (() => {
    const self = chain.find((node) => node.transactionId === transactionId);
    if (self && self.role === 'SUPERSEDED') return 'SUPERSEDED';
    if (self && self.role === 'CORRECTION') return 'CORRECTION';
    return 'CURRENT';
  })();
  const terminal = [...chain].reverse().find((node) => node.role !== 'SUPERSEDED') ?? null;
  return {
    status,
    effectiveTransactionId: status === 'SUPERSEDED' ? (terminal?.transactionId ?? null) : null,
    chain,
  };
}
