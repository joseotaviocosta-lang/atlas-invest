import { describe, expect, it } from 'vitest';
import { resolveAsset } from '@atlas/import-engine';
import { canonicalReconciliationKey } from '@atlas/import-engine';

function asset(id: string, ticker: string, status = 'ACTIVE') {
  return { id, ticker, exchange: 'BVMF', status };
}

describe('Ticker successor resolution (import-engine)', () => {
  it('resolves a known successor to the predecessor asset without creating rows', () => {
    const match = resolveAsset('MBRF3', [asset('id-mrfg3', 'MRFG3')]);
    expect(match.resolution).toBe('RESOLVED');
    expect(match.asset?.id).toBe('id-mrfg3');
    expect(match.viaSuccessor).toBe(true);
  });

  it('resolves PMLL11 to the MALL11 canonical asset', () => {
    const match = resolveAsset('pmll11', [asset('id-mall11', 'MALL11')]);
    expect(match.resolution).toBe('RESOLVED');
    expect(match.asset?.id).toBe('id-mall11');
    expect(match.viaSuccessor).toBe(true);
  });

  it('prefers an exact successor-named row when one exists', () => {
    const match = resolveAsset('MBRF3', [
      asset('id-mrfg3', 'MRFG3'),
      asset('id-mbrf3', 'MBRF3'),
    ]);
    expect(match.resolution).toBe('RESOLVED');
    expect(match.asset?.id).toBe('id-mbrf3');
    expect(match.viaSuccessor).toBe(false);
  });

  it('keeps unknown tickers NOT_FOUND (no fuzzy matching)', () => {
    expect(resolveAsset('MBRF11', [asset('id-mrfg3', 'MRFG3')]).resolution).toBe('NOT_FOUND');
    expect(resolveAsset('XXXX4', []).resolution).toBe('NOT_FOUND');
  });

  it('marks direct ticker hits as non-successor resolutions', () => {
    const match = resolveAsset('MRFG3', [asset('id-mrfg3', 'MRFG3')]);
    expect(match.resolution).toBe('RESOLVED');
    expect(match.viaSuccessor).toBe(false);
  });

  it('returns NOT_FOUND when the predecessor row is absent', () => {
    const match = resolveAsset('MBRF3', [asset('id-petr4', 'PETR4')]);
    expect(match.resolution).toBe('NOT_FOUND');
    expect(match.asset).toBeNull();
  });
});

describe('Canonical reconciliation keys (import-engine)', () => {
  it('folds successor and predecessor tickers to one key', () => {
    expect(canonicalReconciliationKey('MBRF3', 'any-id')).toBe(
      canonicalReconciliationKey('MRFG3', 'other-id'),
    );
    expect(canonicalReconciliationKey('PMLL11', 'x')).toBe(
      canonicalReconciliationKey('MALL11', 'y'),
    );
  });

  it('keeps unrelated tickers on distinct keys', () => {
    expect(canonicalReconciliationKey('PETR4', 'a')).not.toBe(
      canonicalReconciliationKey('VALE3', 'b'),
    );
  });

  it('falls back to assetId when no ticker is available', () => {
    expect(canonicalReconciliationKey(undefined, 'asset-1')).toBe('id:asset-1');
    expect(canonicalReconciliationKey('', 'asset-1')).toBe('id:asset-1');
  });
});
