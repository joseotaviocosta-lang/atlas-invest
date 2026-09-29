import type { LatePaymentRuleSet } from '@atlas/tax-engine';

/**
 * Phase 4D.2 — production late-payment rule (federal taxes, Lei 9.430/1996
 * art. 61). Multa 0,33%/dia capped at 20%; juros = SELIC monthly simple sum
 * + 1% payment month; ROUND_HALF_EVEN at 2 decimals. Business-day-sensitive
 * late-fee start is delegated to an official Sicalc snapshot (ADR-270/271).
 */
export const BR_FEDERAL_LATE_PAYMENT_RULE: LatePaymentRuleSet = Object.freeze({
  ruleId: 'BR-FEDERAL-LATE-PAYMENT-ART61',
  version: '1.0.0',
  effectiveFrom: '1997-01-01',
  effectiveTo: null,
  dailyPenaltyRate: '0.33',
  penaltyCapRate: '20',
  penaltyStartAuthority: 'OFFICIAL_SNAPSHOT',
  interestMethod: 'SELIC_MONTHLY_SIMPLE_SUM_PLUS_PAYMENT_MONTH_1_PERCENT',
  paymentMonthRate: '1',
  roundingMode: 'ROUND_HALF_EVEN',
  moneyScale: 2,
  legalSourceIds: ['LEI-9430-1996-ART-61', 'IN-RFB-2097-2022-ART-8'],
  verifiedAt: '2026-09-29',
});

export const PRODUCTION_LATE_PAYMENT_RULE_REGISTRY: readonly LatePaymentRuleSet[] = Object.freeze([
  BR_FEDERAL_LATE_PAYMENT_RULE,
]);
