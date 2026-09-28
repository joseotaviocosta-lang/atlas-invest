import { LocalDate, Money } from '@atlas/domain';
import {
  fiscalCompetenceFromDate,
  type FiscalDataQualityIssue,
  type FiscalEvent,
  type FiscalEventId,
  type FiscalEventType,
  type TaxAssetCategory,
  type TaxRuleSet,
} from '@atlas/tax-engine';

export const BRL = 'BRL';

export function fiscalEvent(input: {
  id: string;
  category: TaxAssetCategory;
  eventType: FiscalEventType;
  date: string;
  currency?: string;
  proceeds?: string;
  amount?: string;
  realizedResult?: string;
  qualityIssues?: FiscalDataQualityIssue[];
}): FiscalEvent {
  const economicDate = LocalDate.from(input.date);
  const currency = input.currency ?? BRL;
  return {
    id: input.id as FiscalEventId,
    sourceTransactionId: `tx-${input.id}`,
    portfolioId: 'portfolio-1',
    accountId: 'account-1',
    sourceTransactionType:
      input.eventType === 'SALE' ? 'SELL' : input.eventType === 'INCOME' ? 'DIVIDEND' : 'BUY',
    economicDate,
    competence: fiscalCompetenceFromDate(economicDate),
    eventType: input.eventType,
    relevance:
      input.eventType === 'SALE' || input.eventType === 'INCOME' ? 'TAXABLE' : 'INFORMATIONAL',
    taxAssetCategory: input.category,
    currency,
    ...(input.proceeds !== undefined ? { proceeds: Money.from(input.proceeds, currency) } : {}),
    ...(input.amount !== undefined ? { amount: Money.from(input.amount, currency) } : {}),
    ...(input.realizedResult !== undefined
      ? { realizedResult: Money.from(input.realizedResult, currency) }
      : {}),
    qualityIssues: Object.freeze(input.qualityIssues ?? []),
    projectionVersion: 'fiscal-projection-v1',
  } as FiscalEvent;
}

export function sale(
  id: string,
  date: string,
  proceeds: string,
  realizedResult?: string,
  category: TaxAssetCategory = 'BRAZILIAN_EQUITY',
  currency = BRL,
): FiscalEvent {
  return fiscalEvent({
    id,
    category,
    eventType: 'SALE',
    date,
    currency,
    proceeds,
    ...(realizedResult !== undefined ? { realizedResult } : {}),
  });
}

export function income(
  id: string,
  date: string,
  amount: string,
  category: TaxAssetCategory = 'FII',
): FiscalEvent {
  return fiscalEvent({ id, category, eventType: 'INCOME', date, amount });
}

export function rule(over: Partial<TaxRuleSet> & { id: string }): TaxRuleSet {
  return {
    jurisdiction: 'BR',
    version: '1',
    effectiveFrom: LocalDate.from('2020-01-01'),
    status: 'VERIFIED',
    ...over,
  } as TaxRuleSet;
}

/** Clearly synthetic production-shaped rule (VERIFIED) for arithmetic tests only. */
export function verifiedRule(
  category: TaxAssetCategory,
  components: TaxRuleSet['components'],
  over: Partial<TaxRuleSet> = {},
): TaxRuleSet {
  return rule({
    id: `TEST-VERIFIED-${category}`,
    taxCategory: category,
    version: 'verified-1',
    source: {
      legalSourceId: 'SYNTHETIC_TEST_ONLY',
      legalSourceReference: 'test fixture',
      verifiedAt: '2026-01-01',
    },
    components,
    ...over,
  });
}

/** Clearly synthetic TEST_ONLY rule. */
export function testOnlyRule(
  category: TaxAssetCategory,
  components: TaxRuleSet['components'],
  over: Partial<TaxRuleSet> = {},
): TaxRuleSet {
  return rule({
    id: `TEST-ONLY-${category}`,
    taxCategory: category,
    version: 'test-1',
    status: 'TEST_ONLY',
    components,
    ...over,
  });
}
