import { describe, expect, it } from 'vitest';
import {
  classifyEquityTradesForTax,
  computeEquityMonthlyTaxCore,
  type EquityExecution,
  type EquitySellLeg,
} from '@atlas/tax-engine';

function normalLeg(
  gross: string,
  cost: string,
  eligibility: EquitySellLeg['assetEligibility'] = 'ELIGIBLE_EQUITY',
): EquitySellLeg {
  return {
    legId: `n-${gross}-${cost}`,
    assetId: 'a1',
    classification: 'NORMAL',
    quantity: '100',
    grossAmount: gross,
    costBasis: cost,
    assetEligibility: eligibility,
  };
}

function dayLeg(gross: string, cost: string): EquitySellLeg {
  return {
    legId: `d-${gross}-${cost}`,
    assetId: 'a1',
    classification: 'DAY_TRADE',
    quantity: '100',
    grossAmount: gross,
    costBasis: cost,
    assetEligibility: 'ELIGIBLE_EQUITY',
  };
}

const base = { taxSubjectId: 's1', competence: '2026-09' };

describe('Phase 4G.2A — equity monthly tax core (fixtures)', () => {
  it('A: exempt profit preserves prior loss', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('18000', '16000')],
      openingNormalLoss: '5000',
      openingDayTradeLoss: '0',
    });
    expect(r.exemption.status).toBe('EXEMPT');
    expect(r.normal.taxableBaseBeforeRate).toBe('0');
    expect(r.normal.lossConsumed).toBe('0');
    expect(r.normal.closingLoss).toBe('5000');
    expect(r.overallStatus).toBe('COMPLETE');
  });

  it('B: taxable profit consumes prior loss', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('25000', '23000')],
      openingNormalLoss: '5000',
      openingDayTradeLoss: '0',
    });
    expect(r.exemption.status).toBe('TAXABLE');
    expect(r.normal.lossConsumed).toBe('2000');
    expect(r.normal.taxableBaseBeforeRate).toBe('0');
    expect(r.normal.closingLoss).toBe('3000');
  });

  it('C: exempt loss without election requires election', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('18000', '20000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(r.normal.lossAdded).toBe('0');
    expect(r.normal.electionStatus).toBe('ELECTION_REQUIRED');
    expect(r.overallStatus).toBe('PARTIAL');
    expect(r.reasonCode).toBe('ELECTION_REQUIRED');
  });

  it('D: exempt loss declared adds to carryforward', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('18000', '20000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
      exemptLossElection: 'DECLARE_FOR_CARRYFORWARD',
    });
    expect(r.normal.lossAdded).toBe('2000');
    expect(r.normal.closingLoss).toBe('2000');
    expect(r.overallStatus).toBe('COMPLETE');
  });

  it('E: exempt loss declined adds nothing', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('18000', '20000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
      exemptLossElection: 'DO_NOT_DECLARE',
    });
    expect(r.normal.lossAdded).toBe('0');
    expect(r.normal.electionStatus).toBe('NOT_DECLARED');
  });

  it('F: taxable loss adds to carryforward automatically', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('25000', '27000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(r.normal.lossAdded).toBe('2000');
    expect(r.normal.closingLoss).toBe('2000');
  });

  it('G: day-trade profit consumes prior day-trade loss only', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [dayLeg('2500', '1000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '1000',
    });
    expect(r.dayTrade.currentResult).toBe('1500');
    expect(r.dayTrade.lossConsumed).toBe('1000');
    expect(r.dayTrade.taxableBaseBeforeRate).toBe('500');
    expect(r.dayTrade.closingLoss).toBe('0');
  });

  it('H: day-trade loss carries forward', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [dayLeg('1200', '2000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(r.dayTrade.lossAdded).toBe('800');
    expect(r.dayTrade.closingLoss).toBe('800');
  });

  it('I: cross-loss is blocked (normal loss untouched by day-trade gain)', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [dayLeg('3000', '1000')],
      openingNormalLoss: '5000',
      openingDayTradeLoss: '0',
    });
    expect(r.dayTrade.taxableBaseBeforeRate).toBe('2000');
    expect(r.normal.closingLoss).toBe('5000');
    expect(r.normal.lossConsumed).toBe('0');
  });

  it('J: exemption boundary is exact (<= exempt)', () => {
    const below = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('19999.99', '10000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    const equal = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('20000.00', '10000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    const above = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('20000.01', '10000')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(below.exemption.status).toBe('EXEMPT');
    expect(equal.exemption.status).toBe('EXEMPT');
    expect(above.exemption.status).toBe('TAXABLE');
  });

  it('unknown asset classification blocks the month', () => {
    const r = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: [normalLeg('18000', '16000', 'UNKNOWN_CLASSIFICATION')],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(r.overallStatus).toBe('BLOCKED');
    expect(r.reasonCode).toBe('UNKNOWN_ASSET_TAX_CLASSIFICATION');
  });
});

function ex(
  transactionId: string,
  side: 'BUY' | 'SELL',
  quantity: string,
  sequence: number,
  institutionId = 'broker-a',
): EquityExecution {
  return {
    transactionId,
    assetId: 'a1',
    institutionId,
    tradeDate: '2026-09-10',
    side,
    quantity,
    unitPrice: '10',
    sequence,
  };
}

describe('Phase 4G.2A — monthly core consumes matcher legs (fixtures K/L)', () => {
  it('K: partial match feeds day trade 50 / normal 70 into the core', () => {
    const executions = [ex('b', 'BUY', '50', 1), ex('s', 'SELL', '120', 2)];
    const result = classifyEquityTradesForTax(executions);
    const legs: EquitySellLeg[] = result.legs
      .filter((leg) => leg.side === 'SELL')
      .map((leg) => ({
        legId: leg.legId,
        assetId: leg.assetId,
        classification: leg.classification,
        quantity: leg.quantity,
        grossAmount: leg.grossAmount,
        costBasis: leg.classification === 'DAY_TRADE' ? '450' : '560',
        assetEligibility: 'ELIGIBLE_EQUITY',
      }));
    const core = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: legs,
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    // normal sell 70 × 10 = 700; day trade 50 × 10 = 500
    expect(core.exemption.grossSalesAmount).toBe('700');
    expect(core.dayTrade.grossSales).toBe('500');
    expect(core.dayTrade.currentResult).toBe('50');
    expect(core.normal.currentResult).toBe('140');
  });

  it('L: cross-broker same-day produces no day trade', () => {
    const executions = [
      ex('a', 'BUY', '100', 1, 'broker-a'),
      ex('b', 'SELL', '100', 1, 'broker-b'),
    ];
    const result = classifyEquityTradesForTax(executions);
    const sellLegs = result.legs.filter((l) => l.side === 'SELL');
    expect(sellLegs.every((l) => l.classification === 'NORMAL')).toBe(true);
    const core = computeEquityMonthlyTaxCore({
      ...base,
      sellLegs: sellLegs.map((l) => ({
        legId: l.legId,
        assetId: l.assetId,
        classification: l.classification,
        quantity: l.quantity,
        grossAmount: l.grossAmount,
        costBasis: '800',
        assetEligibility: 'ELIGIBLE_EQUITY' as const,
      })),
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });
    expect(core.dayTrade.currentResult).toBe('0');
    expect(core.dayTrade.grossSales).toBe('0');
  });
});

describe('Phase 4G.2A — loss invariants (property)', () => {
  it('never produces negative balances and never crosses categories', () => {
    // deterministic sweep over representative inputs
    for (const gross of ['0', '5000', '19999.99', '20000', '20000.01', '50000']) {
      for (const cost of ['0', '1000', '30000', '60000']) {
        for (const opening of ['0', '1000', '9999.99']) {
          const r = computeEquityMonthlyTaxCore({
            ...base,
            sellLegs: [normalLeg(gross, cost), dayLeg(gross, cost)],
            openingNormalLoss: opening,
            openingDayTradeLoss: opening,
          });
          expect(Number(r.normal.closingLoss)).toBeGreaterThanOrEqual(0);
          expect(Number(r.dayTrade.closingLoss)).toBeGreaterThanOrEqual(0);
          expect(Number(r.normal.lossAdded)).toBeGreaterThanOrEqual(0);
          expect(Number(r.dayTrade.lossAdded)).toBeGreaterThanOrEqual(0);
          expect(Number(r.normal.taxableBaseBeforeRate)).toBeGreaterThanOrEqual(0);
          expect(Number(r.dayTrade.taxableBaseBeforeRate)).toBeGreaterThanOrEqual(0);
          // exempt gain never consumes prior normal loss
          if (r.exemption.status === 'EXEMPT' && Number(r.normal.currentResult) > 0) {
            expect(r.normal.lossConsumed).toBe('0');
            expect(r.normal.closingLoss).toBe(opening);
          }
        }
      }
    }
  });
});
