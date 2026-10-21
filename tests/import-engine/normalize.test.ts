import { describe, it, expect } from 'vitest';
import {
  mapHeaders,
  mapOperation,
  normalizeDecimalString,
  isPositiveDecimal,
  normalizeRow,
} from '@atlas/import-engine';
import type { RawImportRow } from '@atlas/import-engine';

const OPTIONS = { today: '2026-06-30', defaultCurrency: 'BRL' };

function row(cells: Record<string, string>, rowNumber = 2): RawImportRow {
  return { rowNumber, cells };
}

describe('Import Engine: template header mapping', () => {
  it('maps PT and EN headers to canonical columns', () => {
    const { mapping, missing } = mapHeaders([
      'Data',
      'Ativo',
      'Operação',
      'Quantidade',
      'Preço Unitário',
      'Corretagem',
      'Moeda',
      'Corretora',
      'Conta',
      'ID Externo',
    ]);
    expect(missing).toEqual([]);
    expect(mapping.date).toBe(0);
    expect(mapping.ticker).toBe(1);
    expect(mapping.operation).toBe(2);
    expect(mapping.quantity).toBe(3);
    expect(mapping.unit_price).toBe(4);
    expect(mapping.fees).toBe(5);
    expect(mapping.currency).toBe(6);
    expect(mapping.broker).toBe(7);
    expect(mapping.account).toBe(8);
    expect(mapping.external_id).toBe(9);
  });

  it('reports missing required columns', () => {
    const { missing } = mapHeaders(['date', 'ticker']);
    expect(missing).toEqual(['operation', 'quantity']);
  });

  it('maps operation synonyms in PT and EN', () => {
    expect(mapOperation('COMPRA')).toEqual({ kind: 'BUY' });
    expect(mapOperation('c')).toEqual({ kind: 'BUY' });
    expect(mapOperation('buy')).toEqual({ kind: 'BUY' });
    expect(mapOperation('VENDA')).toEqual({ kind: 'SELL' });
    expect(mapOperation('v')).toEqual({ kind: 'SELL' });
    expect(mapOperation('sell')).toEqual({ kind: 'SELL' });
    expect(mapOperation('DIVIDENDO')).toEqual({ kind: 'DEFERRED', operation: 'DIVIDEND' });
    expect(mapOperation('JCP')).toEqual({ kind: 'DEFERRED', operation: 'JCP' });
    expect(mapOperation('BONIFICAÇÃO')).toEqual({ kind: 'DEFERRED', operation: 'BONUS' });
    expect(mapOperation('ALIENAÇÃO')).toEqual({ kind: 'UNKNOWN', raw: 'ALIENAÇÃO' });
  });
});

describe('Import Engine: decimal normalization without floats', () => {
  it('accepts BR and ISO decimal spellings as strings', () => {
    expect(normalizeDecimalString('38,50')).toBe('38.50');
    expect(normalizeDecimalString('1.234,56')).toBe('1234.56');
    expect(normalizeDecimalString('1234.56')).toBe('1234.56');
    expect(normalizeDecimalString('100')).toBe('100');
    expect(normalizeDecimalString('  4,90  ')).toBe('4.90');
  });

  it('rejects non-decimal input without coercion', () => {
    expect(normalizeDecimalString('abc')).toBeNull();
    expect(normalizeDecimalString('')).toBeNull();
    expect(normalizeDecimalString('1,2,3')).toBeNull();
    expect(normalizeDecimalString('--5')).toBeNull();
  });

  it('detects positive amounts strictly', () => {
    expect(isPositiveDecimal('100')).toBe(true);
    expect(isPositiveDecimal('0.01')).toBe(true);
    expect(isPositiveDecimal('0')).toBe(false);
    expect(isPositiveDecimal('0.00')).toBe(false);
    expect(isPositiveDecimal('-5')).toBe(false);
  });
});

describe('Import Engine: row normalization', () => {
  const mapping = {
    date: 0,
    ticker: 1,
    operation: 2,
    quantity: 3,
    unit_price: 4,
    fees: 5,
    currency: 6,
    broker: 7,
    account: 8,
    external_id: 9,
  } as const;

  function cells(values: string[]): Record<string, string> {
    return Object.fromEntries(values.map((value, index) => [String(index), value]));
  }

  it('normalizes a clean BR buy row', () => {
    const candidate = normalizeRow(
      row(
        cells([
          '15/01/2026',
          'petr4',
          'compra',
          '100',
          '38,50',
          '4,90',
          'BRL',
          'XP',
          'Principal',
          'NEG-1',
        ]),
      ),
      { ...mapping },
      OPTIONS,
    );
    expect(candidate.status).toBe('READY');
    expect(candidate.issues).toEqual([]);
    expect(candidate.tradeDate).toBe('2026-01-15');
    expect(candidate.ticker).toBe('PETR4');
    expect(candidate.operation).toBe('BUY');
    expect(candidate.rawOperation).toBe('compra');
    expect(candidate.quantity).toBe('100');
    expect(candidate.unitPrice).toBe('38.50');
    expect(candidate.fees).toBe('4.90');
    expect(candidate.currency).toBe('BRL');
    expect(candidate.brokerLabel).toBe('XP');
    expect(candidate.accountLabel).toBe('Principal');
    expect(candidate.externalId).toBe('NEG-1');
  });

  it('accepts ISO dates and defaults currency to BRL', () => {
    const candidate = normalizeRow(
      row(cells(['2026-03-10', 'VALE3', 'VENDA', '50', '72.10', '', '', '', '', ''])),
      { ...mapping },
      OPTIONS,
    );
    expect(candidate.status).toBe('READY');
    expect(candidate.tradeDate).toBe('2026-03-10');
    expect(candidate.fees).toBe('0');
    expect(candidate.currency).toBe('BRL');
    expect(candidate.brokerLabel).toBeUndefined();
  });

  it('marks invalid rows with explicit field issues', () => {
    const candidate = normalizeRow(
      row(cells(['30/02/2026', '', 'COMPRA', 'abc', '0', '', 'XX', '', '', ''])),
      { ...mapping },
      OPTIONS,
    );
    expect(candidate.status).toBe('INVALID');
    const codes = candidate.issues.map((issue) => issue.code);
    expect(codes).toContain('INVALID_DATE');
    expect(codes).toContain('MISSING_TICKER');
    expect(codes).toContain('INVALID_QUANTITY');
    expect(codes).toContain('INVALID_UNIT_PRICE');
    expect(codes).toContain('INVALID_CURRENCY');
  });

  it('defers dividend rows without writing them', () => {
    const candidate = normalizeRow(
      row(cells(['2026-02-15', 'PETR4', 'DIVIDENDO', '100', '0', '', 'BRL', '', '', ''])),
      { ...mapping },
      OPTIONS,
    );
    expect(candidate.status).toBe('UNSUPPORTED');
    expect(candidate.issues[0]?.code).toBe('UNSUPPORTED_OPERATION');
  });

  it('flags future dates for review instead of rejecting', () => {
    const candidate = normalizeRow(
      row(cells(['2026-12-15', 'PETR4', 'COMPRA', '10', '38.50', '', 'BRL', '', '', ''])),
      { ...mapping },
      OPTIONS,
    );
    expect(candidate.status).toBe('NEEDS_REVIEW');
    expect(candidate.issues.map((issue) => issue.code)).toContain('FUTURE_DATE');
  });
});
