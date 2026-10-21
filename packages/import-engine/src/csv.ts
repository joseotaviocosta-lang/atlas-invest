/**
 * Phase 5K — minimal RFC-4180 style CSV parser.
 *
 * Pure function, zero I/O. Cells are returned as trimmed strings only;
 * no numeric coercion happens here (decimal safety is enforced downstream
 * in the normalizer). Spreadsheet values are data, never formulas.
 */

export interface ParsedCsv {
  delimiter: ',' | ';';
  headers: string[];
  rows: string[][];
}

export class CsvParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CsvParseError';
    this.code = code;
  }
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function detectDelimiter(firstLine: string): ',' | ';' {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < firstLine.length; i += 1) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === ',') {
      commas += 1;
    } else if (!inQuotes && ch === ';') {
      semicolons += 1;
    }
  }
  return semicolons > commas ? ';' : ',';
}

export function parseCsv(content: string, maxRows: number): ParsedCsv {
  const text = stripBom(content);
  if (text.trim() === '') {
    throw new CsvParseError(
      'EMPTY_FILE',
      'Arquivo vazio. Envie um CSV com cabeçalho e ao menos uma linha.',
    );
  }

  const delimiter: ',' | ';' = detectDelimiter(text.split(/\r\n|\n|\r/, 1)[0] ?? '');

  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let hasContent = false;

  const pushField = (): void => {
    record.push(field.trim());
    field = '';
  };

  const pushRecord = (): void => {
    if (record.length === 1 && record[0] === '' && !hasContent) {
      record = [];
      return;
    }
    rows.push(record);
    record = [];
    hasContent = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      hasContent = true;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
      hasContent = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      pushField();
      pushRecord();
    } else {
      field += ch;
      if (ch !== ' ' && ch !== '\t') {
        hasContent = true;
      }
    }
  }

  if (inQuotes) {
    throw new CsvParseError(
      'MALFORMED_STRUCTURE',
      'Estrutura inválida: aspas sem fechamento no arquivo.',
    );
  }
  pushField();
  pushRecord();

  if (rows.length === 0) {
    throw new CsvParseError(
      'EMPTY_FILE',
      'Arquivo vazio. Envie um CSV com cabeçalho e ao menos uma linha.',
    );
  }

  const headers = rows[0]!;
  const dataRows = rows.slice(1).filter((r) => !(r.length === 1 && r[0] === ''));
  if (dataRows.length === 0) {
    throw new CsvParseError(
      'HEADER_ONLY',
      'Arquivo contém apenas o cabeçalho, sem linhas de operações.',
    );
  }
  if (dataRows.length > maxRows) {
    throw new CsvParseError(
      'ROW_LIMIT_EXCEEDED',
      `Arquivo com ${dataRows.length} linhas excede o limite de ${maxRows} por importação.`,
    );
  }

  return { delimiter, headers, rows: dataRows };
}
