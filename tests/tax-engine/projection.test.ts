import { describe, it, expect } from 'vitest';
import { TRANSACTION_TYPES } from '@atlas/domain';
import {
  projectFiscalEvents,
  getTransactionFiscalMapping,
  deriveFiscalEventId,
  type CanonicalRealizedResult,
} from '@atlas/tax-engine';
import {
  allSixteenTypes,
  amortization,
  bonus,
  buy,
  cashMovement,
  expense,
  income,
  sell,
  split,
  subscription,
  transfer,
  uuidFor,
  PETR,
  VALE,
} from './helpers';

const onePerType = [
  buy('t-buy'),
  sell('t-sell'),
  income('DIVIDEND', 't-div'),
  income('JCP', 't-jcp'),
  income('FII_INCOME', 't-fii'),
  bonus('t-bonus'),
  split('SPLIT', 't-split'),
  split('REVERSE_SPLIT', 't-rsplit'),
  subscription('t-sub'),
  amortization('t-amort'),
  transfer('TRANSFER_IN', 't-tin'),
  transfer('TRANSFER_OUT', 't-tout'),
  cashMovement('DEPOSIT', 't-dep'),
  cashMovement('WITHDRAWAL', 't-wd'),
  expense('FEE', 't-fee'),
  expense('TAX', 't-tax'),
];

describe('Phase 4A — Transaction -> FiscalEvent projection', () => {
  it('classifies every canonical transaction type explicitly (no silent drop)', () => {
    const events = projectFiscalEvents(onePerType);
    expect(events).toHaveLength(TRANSACTION_TYPES.length);
    for (const event of events) {
      const mapping = getTransactionFiscalMapping(event.sourceTransactionType as never);
      expect(event.eventType).toBe(mapping.eventType);
      expect(event.relevance).toBe(mapping.relevance);
    }
  });

  it('maps transfers as non-taxable, never as purchase/sale', () => {
    const events = projectFiscalEvents([
      transfer('TRANSFER_IN', 'tin'),
      transfer('TRANSFER_OUT', 'tout'),
    ]);
    expect(events.map((e) => e.eventType).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    for (const e of events) {
      expect(e.relevance).toBe('NON_TAXABLE');
      expect(e.eventType).not.toBe('SALE');
      expect(e.eventType).not.toBe('PURCHASE');
      expect(e.proceeds).toBeUndefined();
      expect(e.realizedResult).toBeUndefined();
    }
  });

  it('keeps dividend, JCP and FII income as distinct source events', () => {
    const events = projectFiscalEvents([
      income('DIVIDEND', 'd'),
      income('JCP', 'j'),
      income('FII_INCOME', 'f'),
    ]);
    expect(events.map((e) => e.sourceTransactionType).sort()).toEqual([
      'DIVIDEND',
      'FII_INCOME',
      'JCP',
    ]);
    for (const e of events) expect(e.eventType).toBe('INCOME');
  });

  it('purchase produces no proceeds and no realized result', () => {
    const [event] = projectFiscalEvents([buy('b', '2026-09-01', '10', '25.00')], {
      assetTypeByAssetId: new Map([[PETR, 'STOCK']]),
    });
    expect(event!.eventType).toBe('PURCHASE');
    expect(event!.relevance).toBe('INFORMATIONAL');
    expect(event!.proceeds).toBeUndefined();
    expect(event!.realizedResult).toBeUndefined();
    expect(event!.qualityIssues).toHaveLength(0);
  });

  it('sale proceeds are computed exactly (gross - fees - taxes)', () => {
    const [event] = projectFiscalEvents([
      sell('s', '2026-09-20', '10', '30.00', 'BRL', PETR, '1', '2'),
    ]);
    expect(event!.eventType).toBe('SALE');
    expect(event!.relevance).toBe('TAXABLE');
    expect(event!.proceeds!.amount).toBe('297');
  });

  it('sale without canonical realized data flags UNKNOWN_COST_BASIS (never zero)', () => {
    const [event] = projectFiscalEvents([sell('s2')]);
    expect(event!.qualityIssues).toContain('UNKNOWN_COST_BASIS');
    expect(event!.costBasis).toBeUndefined();
    expect(event!.realizedResult).toBeUndefined();
  });

  it('sale reuses canonical realized result without re-deriving gain', () => {
    const canonical = new Map<string, CanonicalRealizedResult>([
      [
        uuidFor('s3'),
        {
          netProceeds: '300',
          costBasisRemoved: '250',
          realizedGainLoss: '50',
          status: 'KNOWN',
        },
      ],
    ]);
    const [event] = projectFiscalEvents([sell('s3')], {
      canonicalRealizedByTransactionId: canonical,
    });
    expect(event!.costBasis!.amount).toBe('250');
    expect(event!.realizedResult!.amount).toBe('50');
    expect(event!.qualityIssues).not.toContain('UNKNOWN_COST_BASIS');
  });

  it('propagates INCOMPLETE canonical results as UNKNOWN_COST_BASIS', () => {
    const canonical = new Map<string, CanonicalRealizedResult>([
      [uuidFor('s4'), { netProceeds: '300', status: 'INCOMPLETE' }],
    ]);
    const [event] = projectFiscalEvents([sell('s4')], {
      canonicalRealizedByTransactionId: canonical,
    });
    expect(event!.qualityIssues).toContain('UNKNOWN_COST_BASIS');
    expect(event!.realizedResult).toBeUndefined();
  });

  it('flags unknown asset tax category when classification is unavailable', () => {
    const [event] = projectFiscalEvents([buy('b2', '2026-09-01', '1', '10', 'BRL', VALE)], {
      // no assetTypeByAssetId provided
    });
    expect(event!.taxAssetCategory).toBe('UNKNOWN');
    expect(event!.qualityIssues).toContain('UNKNOWN_ASSET_TAX_CATEGORY');
  });

  it('classifies via canonical asset type metadata when provided', () => {
    const [event] = projectFiscalEvents([buy('b3', '2026-09-01', '1', '10', 'BRL', PETR)], {
      assetTypeByAssetId: new Map([[PETR, 'STOCK']]),
    });
    expect(event!.taxAssetCategory).toBe('BRAZILIAN_EQUITY');
    expect(event!.qualityIssues).not.toContain('UNKNOWN_ASSET_TAX_CATEGORY');
  });

  it('flags unsupported currency (USD) and never assumes BRL', () => {
    const [event] = projectFiscalEvents([buy('b4', '2026-09-01', '1', '10', 'USD', PETR)], {
      assetTypeByAssetId: new Map([[PETR, 'STOCK']]),
    });
    expect(event!.currency).toBe('USD');
    expect(event!.qualityIssues).toContain('UNSUPPORTED_CURRENCY');
  });

  it('derives a stable fiscal event id from source transaction + projection version', () => {
    const [event] = projectFiscalEvents([buy('deterministic-id')]);
    expect(event!.id).toBe(deriveFiscalEventId(uuidFor('deterministic-id')));
    expect(event!.sourceTransactionId).toBe(uuidFor('deterministic-id'));
  });

  it('orders projected events deterministically by economic date', () => {
    const events = projectFiscalEvents([
      buy('late', '2026-09-20'),
      buy('early', '2026-09-01'),
      buy('mid', '2026-09-10'),
    ]);
    expect(events.map((e) => e.sourceTransactionId)).toEqual([
      uuidFor('early'),
      uuidFor('mid'),
      uuidFor('late'),
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [buy('x', '2026-09-20'), buy('y', '2026-09-01')];
    const before = input.map((t) => t.id);
    projectFiscalEvents(input);
    expect(input.map((t) => t.id)).toEqual(before);
  });

  it('exhaustively maps all sixteen types via allSixteenTypes helper', () => {
    const events = projectFiscalEvents(allSixteenTypes('p'));
    expect(events).toHaveLength(16);
    expect(new Set(events.map((e) => e.sourceTransactionType)).size).toBe(16);
  });
});
