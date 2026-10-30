import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { successorDisplayFor } from '../../apps/mobile/src/lib/asset-display';

function positionCard(): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      'apps/mobile/src/components/portfolio/PositionCard.tsx',
    ),
    'utf8',
  );
}

describe('Mobile successor display helper', () => {
  it('maps renamed predecessors to the current symbol with a note', () => {
    expect(successorDisplayFor('MRFG3')).toEqual({
      currentTicker: 'MBRF3',
      predecessorTicker: 'MRFG3',
      successionNote: 'anteriormente MRFG3',
    });
  });

  it('leaves unmapped tickers untouched', () => {
    expect(successorDisplayFor('PETR4').successionNote).toBeNull();
  });

  it('keeps the epoch ticker for historical snapshots', () => {
    expect(successorDisplayFor('MALL11', '2024-12-31').currentTicker).toBe('MALL11');
  });
});

describe('Mobile PositionCard successor surface', () => {
  it('renders the current symbol with predecessor note hooks', () => {
    const src = positionCard();
    expect(src).toContain('successorDisplayFor');
    expect(src).toContain('successionNote');
    // Routing still uses the row's own assetId, never the successor symbol.
    expect(src).toContain('position.assetId}');
  });
});
