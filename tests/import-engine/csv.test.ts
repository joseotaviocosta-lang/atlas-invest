import { describe, it, expect } from 'vitest';
import { parseCsv, CsvParseError } from '@atlas/import-engine';
import { MAX_IMPORT_ROWS } from '@atlas/import-engine';

describe('Import Engine: CSV parser', () => {
  it('parses a canonical semicolon file with PT headers', () => {
    const parsed = parseCsv(
      'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id\n' +
        '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Principal;NEG-1\n',
      MAX_IMPORT_ROWS,
    );
    expect(parsed.delimiter).toBe(';');
    expect(parsed.headers).toHaveLength(10);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual([
      '15/01/2026',
      'PETR4',
      'COMPRA',
      '100',
      '38,50',
      '4,90',
      'BRL',
      'XP',
      'Principal',
      'NEG-1',
    ]);
  });

  it('parses comma-delimited files with quoted fields', () => {
    const parsed = parseCsv(
      'date,ticker,operation,quantity,unit_price,notes\n' +
        '2026-01-15,PETR4,BUY,100,38.50,"nota, com vírgula"\n',
      MAX_IMPORT_ROWS,
    );
    expect(parsed.delimiter).toBe(',');
    expect(parsed.rows[0]).toEqual([
      '2026-01-15',
      'PETR4',
      'BUY',
      '100',
      '38.50',
      'nota, com vírgula',
    ]);
  });

  it('handles escaped quotes and CRLF endings', () => {
    const parsed = parseCsv(
      'date;ticker;operation;quantity;unit_price\r\n2026-01-15;PETR4;"COMPRA";100;"38,50"\r\n',
      MAX_IMPORT_ROWS,
    );
    expect(parsed.rows[0]).toEqual(['2026-01-15', 'PETR4', 'COMPRA', '100', '38,50']);
  });

  it('strips BOM and ignores blank lines', () => {
    const parsed = parseCsv(
      '﻿date;ticker;operation;quantity;unit_price\n\n2026-01-15;PETR4;COMPRA;100;38.50\n\n',
      MAX_IMPORT_ROWS,
    );
    expect(parsed.headers[0]).toBe('date');
    expect(parsed.rows).toHaveLength(1);
  });

  it('rejects empty files', () => {
    expect(() => parseCsv('   \n  ', MAX_IMPORT_ROWS)).toThrowError(CsvParseError);
    try {
      parseCsv('', MAX_IMPORT_ROWS);
      expect.unreachable();
    } catch (error) {
      expect((error as CsvParseError).code).toBe('EMPTY_FILE');
    }
  });

  it('rejects header-only files', () => {
    try {
      parseCsv('date;ticker;operation;quantity;unit_price\n', MAX_IMPORT_ROWS);
      expect.unreachable();
    } catch (error) {
      expect((error as CsvParseError).code).toBe('HEADER_ONLY');
    }
  });

  it('rejects unterminated quotes', () => {
    try {
      parseCsv('date;ticker;operation;quantity\n2026-01-15;"PETR4;COMPRA;100\n', MAX_IMPORT_ROWS);
      expect.unreachable();
    } catch (error) {
      expect((error as CsvParseError).code).toBe('MALFORMED_STRUCTURE');
    }
  });

  it('enforces the row limit', () => {
    const header = 'date;ticker;operation;quantity;unit_price\n';
    const body = '2026-01-15;PETR4;COMPRA;100;38.50\n'.repeat(MAX_IMPORT_ROWS + 1);
    try {
      parseCsv(header + body, MAX_IMPORT_ROWS);
      expect.unreachable();
    } catch (error) {
      expect((error as CsvParseError).code).toBe('ROW_LIMIT_EXCEEDED');
    }
  });
});
