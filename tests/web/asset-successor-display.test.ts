import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { successorDisplayFor } from '@/lib/asset-display';

function positionRow(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'apps/web/src/components/portfolio/PositionRow.tsx'),
    'utf8',
  );
}

describe('Web successor display helper', () => {
  it('maps renamed predecessors to the current symbol with a note', () => {
    expect(successorDisplayFor('MRFG3')).toEqual({
      currentTicker: 'MBRF3',
      predecessorTicker: 'MRFG3',
      successionNote: 'anteriormente MRFG3',
    });
    expect(successorDisplayFor('MALL11')).toEqual({
      currentTicker: 'PMLL11',
      predecessorTicker: 'MALL11',
      successionNote: 'anteriormente MALL11',
    });
  });

  it('leaves unmapped tickers untouched', () => {
    expect(successorDisplayFor('PETR4')).toEqual({
      currentTicker: 'PETR4',
      predecessorTicker: null,
      successionNote: null,
    });
  });

  it('keeps the epoch ticker for historical snapshots before effectiveness', () => {
    expect(successorDisplayFor('MRFG3', '2024-12-31')).toEqual({
      currentTicker: 'MRFG3',
      predecessorTicker: null,
      successionNote: null,
    });
  });

  it('handles empty input without crashing', () => {
    expect(successorDisplayFor(null).currentTicker).toBe('');
    expect(successorDisplayFor('').successionNote).toBeNull();
  });
});

describe('Web PositionRow successor surface', () => {
  it('renders the current symbol with predecessor note hooks', () => {
    const src = positionRow();
    expect(src).toContain('successorDisplayFor');
    expect(src).toContain('successionNote');
    expect(src).toContain('displayTicker');
  });
});
