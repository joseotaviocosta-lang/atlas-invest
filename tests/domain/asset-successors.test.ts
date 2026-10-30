import { describe, expect, it } from 'vitest';
import {
  TICKER_SUCCESSORS,
  findPredecessorEntry,
  findSuccessorEntry,
  areSuccessorEquivalent,
  isWellFormedSuccessorEntry,
  resolveCanonicalTicker,
  resolveCurrentTicker,
} from '../../packages/domain/src/index';

describe('Domain: ticker successor registry (corporate identity, no ledger events)', () => {
  it('contains exactly the two evidenced 1:1 renames', () => {
    expect(TICKER_SUCCESSORS).toHaveLength(2);
    const pairs = TICKER_SUCCESSORS.map((e) => `${e.predecessor}->${e.successor}`).sort();
    expect(pairs).toEqual(['MALL11->PMLL11', 'MRFG3->MBRF3']);
    for (const entry of TICKER_SUCCESSORS) {
      expect(entry.relation).toBe('TICKER_RENAME');
      expect(entry.ratio).toBe('1');
      expect(isWellFormedSuccessorEntry(entry)).toBe(true);
    }
  });

  it('is frozen and structurally sound (no chains, self-maps or duplicates)', () => {
    expect(Object.isFrozen(TICKER_SUCCESSORS)).toBe(true);
    const predecessors = TICKER_SUCCESSORS.map((e) => e.predecessor);
    const successors = TICKER_SUCCESSORS.map((e) => e.successor);
    expect(new Set(predecessors).size).toBe(predecessors.length);
    expect(new Set(successors).size).toBe(successors.length);
    for (const entry of TICKER_SUCCESSORS) {
      // No chains: a successor is never another entry's predecessor.
      expect(predecessors).not.toContain(entry.successor);
      expect(entry.predecessor).not.toBe(entry.successor);
    }
  });

  it('carries identity fields only — never quantity, cost or economics', () => {
    for (const entry of TICKER_SUCCESSORS) {
      expect(Object.keys(entry).sort()).toEqual([
        'effectiveDate',
        'effectiveDateSource',
        'predecessor',
        'ratio',
        'relation',
        'successor',
      ]);
    }
  });

  it('resolves successors and predecessors explicitly (no fuzzy matching)', () => {
    expect(findSuccessorEntry('MALL11')?.successor).toBe('PMLL11');
    expect(findSuccessorEntry('mrfg3')?.successor).toBe('MBRF3');
    expect(findPredecessorEntry('PMLL11')?.predecessor).toBe('MALL11');
    expect(findPredecessorEntry('mbrf3')?.predecessor).toBe('MRFG3');
    // Unknown tickers: null, never guessed.
    expect(findSuccessorEntry('PETR4')).toBeNull();
    expect(findPredecessorEntry('PETR4')).toBeNull();
    expect(findSuccessorEntry('MALL')).toBeNull();
    expect(findSuccessorEntry('')).toBeNull();
    // Near-miss similarity never maps (no textual inference).
    expect(findPredecessorEntry('MBRF11')).toBeNull();
    expect(findSuccessorEntry('MALL12')).toBeNull();
  });

  it('resolves the current ticker honoring effective dates', () => {
    // After effectiveness: successor is authoritative.
    expect(resolveCurrentTicker('MRFG3', '2026-10-29')).toBe('MBRF3');
    expect(resolveCurrentTicker('MALL11', '2026-10-29')).toBe('PMLL11');
    // Before effectiveness: predecessor stays authoritative (never early).
    expect(resolveCurrentTicker('MRFG3', '2024-12-31')).toBe('MRFG3');
    expect(resolveCurrentTicker('MALL11', '2024-12-31')).toBe('MALL11');
    // No asOf: latest mapping wins.
    expect(resolveCurrentTicker('MRFG3')).toBe('MBRF3');
    // Unknown and empty pass through untouched.
    expect(resolveCurrentTicker('PETR4')).toBe('PETR4');
    expect(resolveCurrentTicker('PETR4', '2026-10-29')).toBe('PETR4');
  });

  it('folds successors to the predecessor canonical key', () => {
    expect(resolveCanonicalTicker('MBRF3')).toBe('MRFG3');
    expect(resolveCanonicalTicker('MRFG3')).toBe('MRFG3');
    expect(resolveCanonicalTicker('PMLL11')).toBe('MALL11');
    expect(resolveCanonicalTicker('PETR4')).toBe('PETR4');
  });

  it('tests economic equivalence across the rename boundary', () => {
    expect(areSuccessorEquivalent('MRFG3', 'MBRF3')).toBe(true);
    expect(areSuccessorEquivalent('MALL11', 'PMLL11')).toBe(true);
    expect(areSuccessorEquivalent('MRFG3', 'MRFG3')).toBe(true);
    expect(areSuccessorEquivalent('MRFG3', 'PMLL11')).toBe(false);
    expect(areSuccessorEquivalent('PETR4', 'VALE3')).toBe(false);
    expect(areSuccessorEquivalent('', 'MBRF3')).toBe(false);
  });
});
