/**
 * Phase 5K Hotfix — Native B3 XLSX Import for Real Portfolio Validation.
 *
 * Implements deterministic detection and parsing of official Excel files
 * exported by Área do Investidor B3 (Extratos -> Negociação), plus detection
 * of other official B3 layouts (Movimentação, Eventos, Posição, Consolidado Anual).
 *
 * Security & Integrity:
 * - Bounded buffer size (MAX_IMPORT_BYTES = 2MB).
 * - Bounded row count (MAX_IMPORT_ROWS = 2000).
 * - Zero execution of formulas, macros or external links.
 * - Zero floating point math (exact decimal strings only).
 * - Pure civil dates (imune to timezone shifts).
 */

import ExcelJS from 'exceljs';
import { LocalDate, Quantity } from '@atlas/domain';
import { normalizeDecimalString } from './normalize';
import { normalizeB3InstitutionName } from './b3-institutions';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  type B3LayoutDetectionResult,
  type ImportIssue,
  type ImportRowStatus,
  type NormalizedCandidate,
} from './types';

export class B3XlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'B3XlsxParseError';
  }
}

function normalizeHeaderString(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractCellValue(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) {
    return '';
  }
  const val = cell.value;
  if (typeof val === 'object') {
    if (val instanceof Date) {
      const y = val.getUTCFullYear();
      const m = String(val.getUTCMonth() + 1).padStart(2, '0');
      const d = String(val.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((chunk) => chunk.text).join('').trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
  }
  return String(val).trim();
}

function parseB3Decimal(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // If it has comma: standard PT-BR decimal: e.g. "1.234,56" or "17,38"
  if (trimmed.includes(',')) {
    const withoutThousands = trimmed.replace(/\./g, '');
    const withDot = withoutThousands.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(withDot) ? withDot : null;
  }
  // If it matches thousand-separator pattern without decimals, e.g. "1.500" or "10.000"
  if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    const withoutThousands = trimmed.replace(/\./g, '');
    return /^-?\d+$/.test(withoutThousands) ? withoutThousands : null;
  }
  return normalizeDecimalString(trimmed);
}

function parseExcelCivilDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;

  // DD/MM/YYYY
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const iso = `${y}-${m}-${d}`;
    try {
      LocalDate.from(iso);
      return iso;
    } catch {
      return null;
    }
  }

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    try {
      LocalDate.from(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  return null;
}

export async function detectB3XlsxLayout(buffer: Buffer): Promise<B3LayoutDetectionResult> {
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new B3XlsxParseError(
      `Arquivo excede o limite de ${MAX_IMPORT_BYTES / 1024 / 1024} MB por importação.`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return {
      isB3: false,
      layout: 'UNKNOWN',
      detectedName: 'Arquivo inválido',
      isSupported: false,
      reason: 'Não foi possível ler o arquivo Excel. Certifique-se de que é um XLSX válido.',
    };
  }

  const sheetNames = workbook.worksheets.map((ws) => normalizeHeaderString(ws.name));

  // 1. Check for B3 Negociação
  for (const ws of workbook.worksheets) {
    const row1 = ws.getRow(1);
    const headers: string[] = [];
    row1.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(normalizeHeaderString(extractCellValue(cell)));
    });

    const hasNegDate = headers.some((h) => h === 'datadonegocio' || h === 'datanegocio');
    const hasMovement = headers.some((h) => h === 'tipodemovimentacao' || h === 'movimentacao');
    const hasTicker = headers.some((h) => h === 'codigodenegociacao' || h === 'codigo');
    const hasQty = headers.some((h) => h === 'quantidade');
    const hasPrice = headers.some((h) => h === 'preco');

    if (hasNegDate && hasMovement && hasTicker && hasQty && hasPrice) {
      return {
        isB3: true,
        layout: 'B3_NEGOTIATION',
        sheetName: ws.name,
        detectedName: 'Área do Investidor B3 — Negociação',
        isSupported: true,
      };
    }
  }

  // 2. Check for B3 Movimentação
  for (const ws of workbook.worksheets) {
    const normName = normalizeHeaderString(ws.name);
    const row1 = ws.getRow(1);
    const headers: string[] = [];
    row1.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(normalizeHeaderString(extractCellValue(cell)));
    });

    const hasEntradaSaida = headers.some((h) => h === 'entradasaida');
    const hasMovimentacao = headers.some((h) => h === 'movimentacao');
    const hasValorOperacao = headers.some((h) => h === 'valordaoperacao');

    if (normName.includes('movimentacao') || (hasEntradaSaida && hasMovimentacao && hasValorOperacao)) {
      return {
        isB3: true,
        layout: 'B3_MOVEMENT',
        sheetName: ws.name,
        detectedName: 'Área do Investidor B3 — Movimentação',
        isSupported: false,
        reason: 'Arquivo B3 reconhecido (Movimentação), mas este tipo ainda não é suportado para importação.',
      };
    }
  }

  // 3. Check for B3 Eventos / Proventos a Receber
  for (const ws of workbook.worksheets) {
    const normName = normalizeHeaderString(ws.name);
    const row1 = ws.getRow(1);
    const headers: string[] = [];
    row1.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(normalizeHeaderString(extractCellValue(cell)));
    });

    const hasPrevPag = headers.some((h) => h === 'previsaodepagamento');
    const hasTipoEvento = headers.some((h) => h === 'tipodeevento');
    const hasValorLiquido = headers.some((h) => h === 'valorliquido');

    if (normName.includes('proventosareceber') || (hasPrevPag && hasTipoEvento && hasValorLiquido)) {
      return {
        isB3: true,
        layout: 'B3_EVENTS',
        sheetName: ws.name,
        detectedName: 'Área do Investidor B3 — Proventos a Receber',
        isSupported: false,
        reason: 'Arquivo B3 reconhecido (Proventos a Receber), mas este tipo ainda não é suportado para importação.',
      };
    }
  }

  // 4. Check for B3 Posição
  const hasAcoesSheet = sheetNames.includes('acoes');
  const hasBdrSheet = sheetNames.includes('bdr');
  const hasEmprestimosSheet = sheetNames.includes('emprestimos');
  const hasFundosSheet = sheetNames.includes('fundodeinvestimento');
  if (hasAcoesSheet && (hasBdrSheet || hasEmprestimosSheet || hasFundosSheet)) {
    return {
      isB3: true,
      layout: 'B3_POSITION',
      detectedName: 'Área do Investidor B3 — Posição',
      isSupported: false,
      reason: 'Arquivo B3 reconhecido (Posição em Custódia), mas este tipo ainda não é suportado para importação.',
    };
  }

  // 5. Check for B3 Relatório Consolidado Anual
  const hasPosAcoes = sheetNames.some((s) => s.includes('posicaoacoes') || s.includes('posicao-acoes'));
  const hasProvRecebidos = sheetNames.some((s) => s.includes('proventosrecebidos'));
  if (hasPosAcoes || hasProvRecebidos) {
    return {
      isB3: true,
      layout: 'B3_ANNUAL_REPORT',
      detectedName: 'Área do Investidor B3 — Relatório Consolidado Anual (Posição Inicial)',
      isSupported: true,
    };
  }

  return {
    isB3: false,
    layout: 'UNKNOWN',
    detectedName: 'Arquivo não reconhecido',
    isSupported: false,
    reason: 'Arquivo Excel não reconhecido como formato oficial da B3.',
  };
}

export interface ParseB3NegotiationOptions {
  maxRows?: number;
  today?: string;
}

export async function parseB3NegotiationXlsx(
  buffer: Buffer,
  options: ParseB3NegotiationOptions = {},
): Promise<NormalizedCandidate[]> {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;

  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new B3XlsxParseError(
      `Arquivo excede o limite de ${MAX_IMPORT_BYTES / 1024 / 1024} MB por importação.`,
    );
  }

  const detection = await detectB3XlsxLayout(buffer);
  if (!detection.isB3 || detection.layout !== 'B3_NEGOTIATION') {
    throw new B3XlsxParseError(
      detection.reason ?? 'Arquivo Excel não reconhecido como Negociação da B3.',
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const worksheet =
    (detection.sheetName ? workbook.getWorksheet(detection.sheetName) : null) ??
    workbook.worksheets[0];

  if (!worksheet) {
    throw new B3XlsxParseError('Planilha de Negociação da B3 não encontrada no arquivo.');
  }

  // Find header row
  let headerRowNum = -1;
  const colMap: Record<string, number> = {};

  for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const cells: Array<{ col: number; norm: string }> = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cells.push({ col: colNumber, norm: normalizeHeaderString(extractCellValue(cell)) });
    });

    const hasDate = cells.some((c) => c.norm === 'datadonegocio' || c.norm === 'datanegocio');
    const hasMovement = cells.some((c) => c.norm === 'tipodemovimentacao' || c.norm === 'movimentacao');
    const hasTicker = cells.some((c) => c.norm === 'codigodenegociacao' || c.norm === 'codigo');

    if (hasDate && hasMovement && hasTicker) {
      headerRowNum = r;
      for (const c of cells) {
        if (c.norm === 'datadonegocio' || c.norm === 'datanegocio') colMap.date = c.col;
        if (c.norm === 'tipodemovimentacao' || c.norm === 'movimentacao') colMap.type = c.col;
        if (c.norm === 'mercado') colMap.market = c.col;
        if (c.norm === 'prazovencimento') colMap.term = c.col;
        if (c.norm === 'instituicao') colMap.broker = c.col;
        if (c.norm === 'codigodenegociacao' || c.norm === 'codigo') colMap.ticker = c.col;
        if (c.norm === 'quantidade') colMap.quantity = c.col;
        if (c.norm === 'preco') colMap.price = c.col;
        if (c.norm === 'valor') colMap.value = c.col;
      }
      break;
    }
  }

  if (headerRowNum === -1 || !colMap.date || !colMap.type || !colMap.ticker || !colMap.quantity || !colMap.price) {
    throw new B3XlsxParseError(
      'Colunas obrigatórias da Negociação B3 ausentes (Data do Negócio, Tipo de Movimentação, Código de Negociação, Quantidade, Preço).',
    );
  }

  const candidates: NormalizedCandidate[] = [];
  let processedDataRows = 0;

  for (let r = headerRowNum + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);

    const rawDateCell = extractCellValue(colMap.date ? row.getCell(colMap.date) : undefined);
    const rawMovementCell = extractCellValue(colMap.type ? row.getCell(colMap.type) : undefined);
    const rawTickerCell = extractCellValue(colMap.ticker ? row.getCell(colMap.ticker) : undefined);
    const rawQtyCell = extractCellValue(colMap.quantity ? row.getCell(colMap.quantity) : undefined);
    const rawPriceCell = extractCellValue(colMap.price ? row.getCell(colMap.price) : undefined);

    // Skip blank rows
    if (!rawDateCell && !rawMovementCell && !rawTickerCell && !rawQtyCell && !rawPriceCell) {
      continue;
    }

    // Skip summary / total rows / repeated header rows
    const normDate = normalizeHeaderString(rawDateCell);
    if (
      normDate.startsWith('total') ||
      normDate.startsWith('subtotal') ||
      normDate.startsWith('resumo') ||
      normDate === 'datadonegocio' ||
      normDate === 'datanegocio'
    ) {
      continue;
    }

    processedDataRows++;
    if (processedDataRows > maxRows) {
      throw new B3XlsxParseError(
        `Arquivo excede o limite de ${maxRows} linhas por importação.`,
      );
    }

    const issues: ImportIssue[] = [];
    let status: ImportRowStatus = 'READY';

    // 1. Trade Date
    const tradeDate = parseExcelCivilDate(rawDateCell);
    if (!tradeDate) {
      status = 'INVALID';
      issues.push({
        code: 'INVALID_DATE',
        field: 'date',
        message: `Data "${rawDateCell}" inválida. Use o formato civil YYYY-MM-DD ou DD/MM/YYYY.`,
      });
    } else if (options.today && tradeDate > options.today) {
      status = 'INVALID';
      issues.push({
        code: 'FUTURE_DATE',
        field: 'date',
        message: `Data "${tradeDate}" no futuro (hoje é ${options.today}).`,
      });
    }

    // 2. Settlement Date (Prazo/Vencimento)
    const rawTermCell = colMap.term ? extractCellValue(row.getCell(colMap.term)) : '';
    const settlementDate = parseExcelCivilDate(rawTermCell) ?? undefined;

    // 3. Movement Type: Compra -> BUY, Venda -> SELL
    const normMovement = normalizeHeaderString(rawMovementCell).toUpperCase();
    let operation: 'BUY' | 'SELL' = 'BUY';

    if (normMovement === 'COMPRA' || normMovement === 'C') {
      operation = 'BUY';
    } else if (normMovement === 'VENDA' || normMovement === 'V') {
      operation = 'SELL';
    } else {
      status = 'UNSUPPORTED';
      issues.push({
        code: 'UNSUPPORTED_OPERATION',
        field: 'operation',
        message: `Operação B3 "${rawMovementCell}" ainda não é suportada na importação (somente Compra e Venda).`,
      });
    }

    // 4. Asset / Ticker
    const ticker = rawTickerCell.trim().toUpperCase();
    if (ticker === '' || !/^[A-Z0-9]{3,10}$/.test(ticker)) {
      status = 'INVALID';
      issues.push({
        code: 'INVALID_TICKER',
        field: 'ticker',
        message: `Ativo "${rawTickerCell.trim()}" inválido`,
      });
    }

    // 5. Quantity
    const quantity = parseB3Decimal(rawQtyCell);
    if (quantity === null) {
      status = 'INVALID';
      issues.push({
        code: 'INVALID_QUANTITY',
        field: 'quantity',
        message: `Quantidade "${rawQtyCell.trim()}" inválida`,
      });
    } else if (!/^\d+(\.\d+)?$/.test(quantity) || /^0+(\.0+)?$/.test(quantity)) {
      status = 'INVALID';
      issues.push({
        code: 'INVALID_QUANTITY',
        field: 'quantity',
        message: 'Quantidade deve ser maior que zero',
      });
    }

    // 6. Unit Price
    const unitPrice = parseB3Decimal(rawPriceCell);
    if (unitPrice === null) {
      status = 'INVALID';
      issues.push({
        code: 'INVALID_UNIT_PRICE',
        field: 'unit_price',
        message: `Preço unitário "${rawPriceCell.trim()}" inválido`,
      });
    } else if (!/^\d+(\.\d+)?$/.test(unitPrice) || /^0+(\.0+)?$/.test(unitPrice)) {
      status = 'INVALID';
      issues.push({
        code: 'INVALID_UNIT_PRICE',
        field: 'unit_price',
        message: 'Preço unitário deve ser maior que zero',
      });
    }

    // 7. Broker / Institution
    const broker = colMap.broker ? extractCellValue(row.getCell(colMap.broker)) : '';
    const market = colMap.market ? extractCellValue(row.getCell(colMap.market)) : '';

    const notesParts: string[] = [];
    if (market && market !== '-') {
      notesParts.push(`Mercado: ${market}`);
    }
    const notes = notesParts.length > 0 ? notesParts.join(' | ') : undefined;

    candidates.push(
      Object.freeze({
        rowNumber: r,
        tradeDate: tradeDate ?? rawDateCell,
        settlementDate,
        ticker,
        operation,
        rawOperation: rawMovementCell.trim(),
        quantity: quantity ?? '0',
        unitPrice: unitPrice ?? '0',
        fees: '0',
        currency: 'BRL',
        brokerLabel: broker !== '' ? broker : undefined,
        accountLabel: broker !== '' ? broker : undefined,
        normalizedInstitution: broker !== '' ? normalizeB3InstitutionName(broker) : undefined,
        externalId: undefined,
        notes,
        status,
        issues,
      }),
    );
  }

  if (candidates.length === 0) {
    throw new B3XlsxParseError(
      'Arquivo de Negociação B3 sem linhas de dados para importar.',
    );
  }

  return candidates;
}

export interface ParseB3AnnualReportOptions {
  maxRows?: number;
  fileName?: string;
  referenceDate?: string;
}

export async function parseB3AnnualReportXlsx(
  buffer: Buffer,
  options: ParseB3AnnualReportOptions = {},
): Promise<NormalizedCandidate[]> {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;

  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new B3XlsxParseError(
      `Arquivo excede o limite de ${MAX_IMPORT_BYTES / 1024 / 1024} MB por importação.`,
    );
  }

  const detection = await detectB3XlsxLayout(buffer);
  if (!detection.isB3 || detection.layout !== 'B3_ANNUAL_REPORT') {
    throw new B3XlsxParseError(
      detection.reason ?? 'Arquivo Excel não reconhecido como Relatório Consolidado Anual da B3.',
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  // 1. Determine baseline effective date (31/12/YYYY)
  let effectiveDate = '2024-12-31';
  if (options.referenceDate) {
    effectiveDate = options.referenceDate;
  } else if (options.fileName) {
    const yearMatch = options.fileName.match(/(20\d{2})/);
    if (yearMatch) {
      effectiveDate = `${yearMatch[1]}-12-31`;
    }
  } else {
    // Scan date cells in loan sheet to detect year
    for (const ws of workbook.worksheets) {
      if (normalizeHeaderString(ws.name).includes('posicaoemprestimos')) {
        for (let r = 2; r <= Math.min(20, ws.rowCount); r++) {
          const row = ws.getRow(r);
          row.eachCell((cell) => {
            const val = extractCellValue(cell);
            const m = val.match(/(20\d{2})/);
            if (m) {
              effectiveDate = `${m[1]}-12-31`;
            }
          });
          if (effectiveDate !== '2024-12-31') break;
        }
      }
    }
  }

  interface BaselineItem {
    ticker: string;
    productName: string;
    brokerLabel: string;
    accountLabel?: string;
    normalQty: Quantity;
    loanedQty: Quantity;
    hasNormalCustody: boolean;
    hasLoanedCustody: boolean;
  }

  const itemsMap = new Map<string, BaselineItem>();

  const extractCleanTicker = (raw: string): string | null => {
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed || trimmed === 'TOTAL' || trimmed === 'SUBTOTAL' || trimmed.startsWith('RESUMO')) {
      return null;
    }
    const match = trimmed.match(/^([A-Z0-9]{3,10})/);
    return match ? match[1]! : null;
  };

  // 2. Parse normal custody sheets: Posição - Ações, Posição - BDR, Posição - Fundos
  const normalSheetNames = ['posicaoacoes', 'posicaobdr', 'posicaofundos'];
  for (const ws of workbook.worksheets) {
    const normSheetName = normalizeHeaderString(ws.name);
    if (!normalSheetNames.some((ns) => normSheetName.includes(ns))) {
      continue;
    }

    let colTicker = -1;
    let colProd = -1;
    let colInst = -1;
    let colAcc = -1;
    let colQty = -1;

    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cells: Array<{ col: number; norm: string }> = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        cells.push({ col: colNumber, norm: normalizeHeaderString(extractCellValue(cell)) });
      });

      const foundTicker = cells.find(
        (c) => c.norm === 'codigodenegociacao' || c.norm === 'codigo' || c.norm === 'produto',
      );
      const foundInst = cells.find((c) => c.norm === 'instituicao');
      const foundQty = cells.find(
        (c) => c.norm === 'quantidade' || c.norm === 'quantidadedisponivel',
      );

      if (foundTicker && foundInst && foundQty) {
        colTicker = foundTicker.col;
        colInst = foundInst.col;
        colQty = foundQty.col;
        const prodCell = cells.find((c) => c.norm === 'produto');
        if (prodCell) colProd = prodCell.col;
        const accCell = cells.find((c) => c.norm === 'conta');
        if (accCell) colAcc = accCell.col;
        break;
      }
    }

    if (colTicker === -1 || colInst === -1 || colQty === -1) {
      continue;
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawTickerCell = extractCellValue(row.getCell(colTicker));
      const rawProdCell = colProd !== -1 ? extractCellValue(row.getCell(colProd)) : '';
      const rawInstCell = extractCellValue(row.getCell(colInst));
      const rawAccCell = colAcc !== -1 ? extractCellValue(row.getCell(colAcc)) : '';
      const rawQtyCell = extractCellValue(row.getCell(colQty));

      const ticker = extractCleanTicker(rawTickerCell) ?? extractCleanTicker(rawProdCell);
      if (!ticker) continue;

      const qtyStr = parseB3Decimal(rawQtyCell);
      if (!qtyStr) continue;

      let qty: Quantity;
      try {
        qty = Quantity.from(qtyStr);
      } catch {
        continue;
      }
      if (qty.compare(Quantity.zero()) <= 0) continue;

      const brokerLabel = rawInstCell.trim() || 'B3';
      const normInst = normalizeB3InstitutionName(brokerLabel);
      const key = `${ticker}::${normInst}`;

      let item = itemsMap.get(key);
      if (!item) {
        item = {
          ticker,
          productName: rawProdCell.trim() || ticker,
          brokerLabel,
          accountLabel: rawAccCell.trim() !== '' && rawAccCell.trim() !== '-' ? rawAccCell.trim() : undefined,
          normalQty: qty,
          loanedQty: Quantity.zero(),
          hasNormalCustody: true,
          hasLoanedCustody: false,
        };
        itemsMap.set(key, item);
      } else {
        item.normalQty = item.normalQty.add(qty);
        item.hasNormalCustody = true;
        if (!item.accountLabel && rawAccCell.trim() !== '' && rawAccCell.trim() !== '-') {
          item.accountLabel = rawAccCell.trim();
        }
      }
    }
  }

  // 3. Parse loan sheet: Posição - Empréstimos
  for (const ws of workbook.worksheets) {
    const normSheetName = normalizeHeaderString(ws.name);
    if (!normSheetName.includes('posicaoemprestimos')) {
      continue;
    }

    let colProd = -1;
    let colInst = -1;
    let colNat = -1;
    let colQty = -1;

    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cells: Array<{ col: number; norm: string }> = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        cells.push({ col: colNumber, norm: normalizeHeaderString(extractCellValue(cell)) });
      });

      const foundProd = cells.find((c) => c.norm === 'produto');
      const foundInst = cells.find((c) => c.norm === 'instituicao');
      const foundNat = cells.find((c) => c.norm === 'natureza');
      const foundQty = cells.find((c) => c.norm === 'quantidade');

      if (foundProd && foundInst && foundNat && foundQty) {
        colProd = foundProd.col;
        colInst = foundInst.col;
        colNat = foundNat.col;
        colQty = foundQty.col;
        break;
      }
    }

    if (colProd === -1 || colInst === -1 || colNat === -1 || colQty === -1) {
      continue;
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawProdCell = extractCellValue(row.getCell(colProd));
      const rawInstCell = extractCellValue(row.getCell(colInst));
      const rawNatCell = extractCellValue(row.getCell(colNat));
      const rawQtyCell = extractCellValue(row.getCell(colQty));

      if (normalizeHeaderString(rawNatCell) !== 'doador') {
        continue;
      }

      const ticker = extractCleanTicker(rawProdCell);
      if (!ticker) continue;

      const qtyStr = parseB3Decimal(rawQtyCell);
      if (!qtyStr) continue;

      let qty: Quantity;
      try {
        qty = Quantity.from(qtyStr);
      } catch {
        continue;
      }
      if (qty.compare(Quantity.zero()) <= 0) continue;

      const brokerLabel = rawInstCell.trim() || 'B3';
      const normInst = normalizeB3InstitutionName(brokerLabel);
      const key = `${ticker}::${normInst}`;

      let item = itemsMap.get(key);
      if (!item) {
        item = {
          ticker,
          productName: rawProdCell.trim() || ticker,
          brokerLabel,
          accountLabel: undefined,
          normalQty: Quantity.zero(),
          loanedQty: qty,
          hasNormalCustody: false,
          hasLoanedCustody: true,
        };
        itemsMap.set(key, item);
      } else {
        item.loanedQty = item.loanedQty.add(qty);
        item.hasLoanedCustody = true;
      }
    }
  }

  if (itemsMap.size === 0) {
    throw new B3XlsxParseError(
      'Relatório Consolidado Anual B3 sem posições de custódia para importar.',
    );
  }

  // 4. Sort deterministically: ticker ASC, broker ASC
  const sortedItems = Array.from(itemsMap.values()).sort((a, b) => {
    const tCmp = a.ticker.localeCompare(b.ticker);
    if (tCmp !== 0) return tCmp;
    return a.brokerLabel.localeCompare(b.brokerLabel);
  });

  const [y, m, d] = effectiveDate.split('-');
  const formattedCivilDate = `${d}/${m}/${y}`;

  const candidates: NormalizedCandidate[] = [];
  let rowSeq = 0;

  for (const item of sortedItems) {
    const totalQty = item.normalQty.add(item.loanedQty);
    if (totalQty.compare(Quantity.zero()) <= 0) {
      continue;
    }

    rowSeq++;
    if (rowSeq > maxRows) {
      throw new B3XlsxParseError(
        `Arquivo excede o limite de ${maxRows} linhas por importação.`,
      );
    }

    let custodyDetail = '';
    if (item.hasLoanedCustody && item.hasNormalCustody) {
      custodyDetail = ` (Custódia: ${item.normalQty.value} + Empréstimo Doador: ${item.loanedQty.value})`;
    } else if (item.hasLoanedCustody && !item.hasNormalCustody) {
      custodyDetail = ` (Empréstimo Doador: ${item.loanedQty.value})`;
    }

    const notes = `Posição em ${formattedCivilDate}${custodyDetail} | Custo de aquisição fiscal a informar`;

    candidates.push(
      Object.freeze({
        rowNumber: rowSeq,
        tradeDate: effectiveDate,
        settlementDate: undefined,
        ticker: item.ticker,
        operation: 'TRANSFER_IN',
        rawOperation: 'POSICAO_INICIAL',
        quantity: totalQty.value,
        unitPrice: '0',
        fees: '0',
        currency: 'BRL',
        brokerLabel: item.brokerLabel,
        accountLabel: item.accountLabel ?? item.brokerLabel,
        normalizedInstitution: normalizeB3InstitutionName(item.brokerLabel),
        externalId: undefined,
        notes,
        status: 'READY',
        issues: [],
      }),
    );
  }

  return candidates;
}
