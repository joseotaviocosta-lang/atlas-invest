import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  applyMovementLedgerGates,
  detectB3XlsxLayout,
  parseB3MovementXlsx,
  summarizeMovementPreview,
  extractMovementRows,
  classifyOne,
  type ClassifiedCandidate,
  type ExistingLedgerRow,
  type NormalizedCandidate,
} from '@atlas/import-engine';

const HEADER = [
  'Entrada/Saída',
  'Data',
  'Movimentação',
  'Produto',
  'Instituição',
  'Quantidade',
  'Preço unitário',
  'Valor da Operação',
];

async function movementBuffer(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Movimentação');
  ws.addRow(HEADER);
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const TODAY = '2026-10-29';
const FILE = 'movimentacao-test.xlsx';

function row(
  direction: string,
  date: string,
  movement: string,
  product: string,
  qty: string,
  price = '-',
  value = '-',
): string[] {
  return [direction, date, movement, product, 'XP INVESTIMENTOS CCTVM S/A.', qty, price, value];
}

function baseExisting(overrides: Partial<ExistingLedgerRow> = {}): ExistingLedgerRow {
  return {
    provider: 'B3',
    externalId: null,
    assetId: 'asset-cogn3',
    accountId: 'acc-xp',
    type: 'BUY',
    tradeDate: '2025-01-01',
    quantity: '100',
    unitPrice: '10.00',
    fees: null,
    amount: null,
    currency: 'BRL',
    fingerprint: 'fp',
    ...overrides,
  };
}

function toClassified(candidate: NormalizedCandidate): ClassifiedCandidate {
  return {
    ...candidate,
    assetId: 'asset-cogn3',
    assetResolution: 'RESOLVED',
    accountId: 'acc-xp',
    accountResolution: 'RESOLVED',
    fingerprint: 'fp-test',
    duplicate: 'NEW',
    provider: 'B3',
  };
}

describe('B3 Movement layout (R1)', () => {
  it('detects the movement layout as supported', async () => {
    const buffer = await movementBuffer([
      row('Credito', '22/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', '30'),
    ]);
    const detection = await detectB3XlsxLayout(buffer);
    expect(detection.isB3).toBe(true);
    expect(detection.layout).toBe('B3_MOVEMENT');
    expect(detection.isSupported).toBe(true);
  });

  it('parses bonus rows as quantity-only BONUS candidates with unknown cost', async () => {
    const buffer = await movementBuffer([
      row('Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA EDUCACAO S.A', '30'),
      row('Credito', '11/12/2025', 'Bonificação em Ativos', 'EZTC3 - EZ TEC', '271,56'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.notices).toHaveLength(0);
    expect(mapped.candidates).toHaveLength(2);
    const cogn3 = mapped.candidates.find((c) => c.ticker === 'COGN3')!;
    expect(cogn3.operation).toBe('BONUS');
    expect(cogn3.quantity).toBe('30');
    expect(cogn3.unitPrice).toBe('0');
    expect(cogn3.tradeDate).toBe('2025-12-29');
    expect(cogn3.externalId).toContain('B3MOV|');
    expect(cogn3.notes).toContain('sem custo atribuído');
    expect(cogn3.status).toBe('READY');
    const eztc3 = mapped.candidates.find((c) => c.ticker === 'EZTC3')!;
    expect(eztc3.quantity).toBe('271.56');
  });

  it('pairs fraction debits with auction credits into one SELL (SOJA3-shaped)', async () => {
    const buffer = await movementBuffer([
      row('Credito', '22/12/2025', 'Bonificação em Ativos', 'SOJA3 - BOA SAFRA', '43,76'),
      row('Debito', '27/01/2026', 'Fração em Ativos', 'SOJA3 - BOA SAFRA', '0,76'),
      row('Credito', '13/03/2026', 'Leilão de Fração', 'SOJA3 - BOA SAFRA', '0,76', '8,06', '6,16'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    const bonus = mapped.candidates.find((c) => c.operation === 'BONUS')!;
    expect(bonus.quantity).toBe('43.76');
    const sells = mapped.candidates.filter((c) => c.operation === 'SELL');
    expect(sells).toHaveLength(1);
    expect(sells[0]!.quantity).toBe('0.76');
    expect(sells[0]!.unitPrice).toBe('8.06');
    expect(sells[0]!.notes).toContain('fração correspondente');
    expect(sells[0]!.status).toBe('READY');
  });

  it('routes cash-only events to notices, never to candidates', async () => {
    const buffer = await movementBuffer([
      row('Credito', '23/10/2026', 'Rendimento', 'SNAG11 - SUNO AGRO', '1846', '0,12', '221,52'),
      row('Credito', '01/10/2026', 'Juros Sobre Capital Próprio', 'ITSA4 - ITAUSA', '1200', '0,024', '24'),
      row('Credito', '29/05/2026', 'Dividendo', 'COGN3 - COGNA', '330', '0,014', '4,71'),
      row('Credito', '14/07/2026', 'Restituição de Capital', 'VIVT3 - TELEFONICA', '400', '1,252', '500,68'),
      row('Credito', '20/05/2026', 'Reembolso', 'EGIE3 - ENGIE', '0', '-', '157,56'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices).toHaveLength(5);
    expect(mapped.notices.every((n) => n.group === 'CASH_ONLY')).toBe(true);
  });

  it('treats Atualização markers and loan custody rows as informational', async () => {
    const buffer = await movementBuffer([
      row('Credito', '07/08/2026', 'Atualização', 'COGN3 - COGNA', '330'),
      row('Credito', '21/10/2026', 'Empréstimo', 'EZTC3 - EZ TEC', '1471'),
      row('Credito', '21/10/2026', 'Empréstimo', 'EZTC3 - EZ TEC', '0', '-', '0,89'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    const groups = mapped.notices.map((n) => n.group).sort();
    expect(groups).toEqual(['CASH_ONLY', 'INFORMATIONAL', 'INFORMATIONAL']);
  });

  it('routes the subscription lifecycle to review, never to silent import', async () => {
    const buffer = await movementBuffer([
      row('Credito', '05/03/2026', 'Direito de Subscrição', 'SNAG12 - SUNO AGRO SUB', '1416'),
      row('Debito', '27/03/2026', 'Solicitação de Subscrição', 'SNAG12 - SUNO AGRO SUB', '100'),
      row('Credito', '30/03/2026', 'Recibo de Subscrição', 'SNAG13 - SUNO AGRO REC', '100'),
      row('Debito', '09/07/2026', 'Direitos de Subscrição - Não Exercido', 'MXRF12 - MAXI SUB', '0'),
      row('Credito', '08/07/2026', 'Cessão de Direitos', 'MXRF12 - MAXI SUB', '341'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices).toHaveLength(5);
    expect(mapped.notices.every((n) => n.group === 'REVIEW_REQUIRED')).toBe(true);
    expect(mapped.notices.every((n) => n.reasonCode === 'SUBSCRIPTION_LIFECYCLE_MANUAL')).toBe(true);
  });

  it('fails closed on unknown movement labels', async () => {
    const buffer = await movementBuffer([
      row('Credito', '01/06/2026', 'Fusão Estranha', 'PETR4 - PETROBRAS', '10'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices).toHaveLength(1);
    expect(mapped.notices[0]!.group).toBe('REVIEW_REQUIRED');
    expect(mapped.notices[0]!.reasonCode).toBe('UNKNOWN_MOVEMENT_LABEL');
  });

  it('flags priced bonus for review instead of fabricating cost', async () => {
    const buffer = await movementBuffer([
      row('Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', '30', '1,50'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(1);
    expect(mapped.candidates[0]!.status).toBe('NEEDS_REVIEW');
    expect(mapped.candidates[0]!.issues[0]!.code).toBe('BONUS_WITH_PRICE');
  });

  it('emits no rows for assets absent from the file (STBP3 regression)', async () => {
    const buffer = await movementBuffer([
      row('Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', '30'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates.some((c) => c.ticker === 'STBP3')).toBe(false);
    expect(mapped.notices.some((n) => n.ticker === 'STBP3')).toBe(false);
  });

  it('produces stable externalIds across re-parses (duplicate safety)', async () => {
    const rows = [row('Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', '30')];
    const first = await parseB3MovementXlsx(await movementBuffer(rows), { fileName: FILE, today: TODAY });
    const second = await parseB3MovementXlsx(await movementBuffer(rows), { fileName: FILE, today: TODAY });
    expect(first.candidates[0]!.externalId).toBe(second.candidates[0]!.externalId);
  });

  it('classifies an identical reupload as EXACT_DUPLICATE via source identity', () => {
    const candidate = {
      rowNumber: 2,
      tradeDate: '2025-12-29',
      ticker: 'COGN3',
      operation: 'BONUS' as const,
      rawOperation: 'Bonificação em Ativos',
      quantity: '30',
      unitPrice: '0',
      fees: '0',
      currency: 'BRL',
      externalId: 'B3MOV|f|2|2025-12-29|Bonificação em Ativos|COGN3|30|CREDITO',
      notes: 'n',
      status: 'READY' as const,
      issues: [],
    };
    const classified = classifyOne({
      portfolioId: 'port-1',
      provider: 'B3',
      candidate,
      assetMatch: { resolution: 'RESOLVED', asset: { id: 'asset-cogn3', ticker: 'COGN3', exchange: 'BVMF', status: 'ACTIVE' }, candidates: [] },
      accountMatch: { resolution: 'RESOLVED', account: { id: 'acc-xp', name: 'XP' }, candidates: [] },
      defaultAccountId: null,
      existing: [
        baseExisting({
          externalId: 'B3MOV|f|2|2025-12-29|Bonificação em Ativos|COGN3|30|CREDITO',
          provider: 'B3',
          assetId: 'asset-cogn3',
          accountId: 'acc-xp',
          type: 'BONUS',
          tradeDate: '2025-12-29',
          quantity: '30',
          unitPrice: null,
          fees: null,
        }),
      ],
    });
    expect(classified.duplicate).toBe('EXACT_DUPLICATE');
  });
});

describe('B3 Movement ledger gates (R1)', () => {
  function transferCandidate(overrides: Partial<NormalizedCandidate> = {}): ClassifiedCandidate {
    return toClassified({
      rowNumber: 2,
      tradeDate: '2026-10-08',
      ticker: 'HYPE3',
      operation: 'TRANSFER_IN',
      rawOperation: 'Transferência',
      quantity: '400',
      unitPrice: '0',
      fees: '0',
      currency: 'BRL',
      externalId: 'B3MOV|x',
      notes: 'n',
      status: 'READY',
      issues: [],
      ...overrides,
    });
  }

  it('marks mirrored loan-roll transfer pairs as loan custody state (HYPE3-shaped)', () => {
    const out = transferCandidate({ operation: 'TRANSFER_OUT' });
    const inn = transferCandidate({ operation: 'TRANSFER_IN' });
    const gated = applyMovementLedgerGates({ candidates: [out, inn], existing: [] });
    expect(gated.every((c) => c.status === 'UNSUPPORTED')).toBe(true);
    expect(gated.every((c) => c.issues.some((i) => i.code === 'LOAN_CUSTODY_STATE'))).toBe(true);
  });

  it('marks priced liquidations mirroring ledger trades as settlement shadows', () => {
    const shadow = transferCandidate({
      rawOperation: 'Transferência - Liquidação',
      quantity: '200',
      unitPrice: '21.35',
      tradeDate: '2026-08-14',
    });
    const gated = applyMovementLedgerGates({
      candidates: [shadow],
      existing: [
        baseExisting({
          assetId: 'asset-cogn3',
          accountId: 'acc-xp',
          type: 'BUY',
          tradeDate: '2026-08-12',
          quantity: '200',
          unitPrice: '21.35',
        }),
      ],
    });
    expect(gated[0]!.status).toBe('UNSUPPORTED');
    expect(gated[0]!.issues.some((i) => i.code === 'SETTLEMENT_SHADOW_OF_TRADE')).toBe(true);
  });

  it('sends unmatched priced settlements to review (missing-trade signal)', () => {
    const shadow = transferCandidate({
      rawOperation: 'Transferência - Liquidação',
      quantity: '400',
      unitPrice: '40.5',
      tradeDate: '2026-02-11',
      ticker: 'VIVT3',
    });
    const gated = applyMovementLedgerGates({ candidates: [shadow], existing: [] });
    expect(gated[0]!.status).toBe('NEEDS_REVIEW');
    expect(gated[0]!.issues.some((i) => i.code === 'UNMATCHED_PRICED_SETTLEMENT')).toBe(true);
  });

  it('blocks pre-baseline trades covered by the opening snapshot (KCRE11 gate)', () => {
    const preBaselineBuy = toClassified({
      rowNumber: 61,
      tradeDate: '2024-12-27',
      ticker: 'KCRE11',
      operation: 'BUY',
      rawOperation: 'Compra',
      quantity: '80',
      unitPrice: '8.45',
      fees: '0',
      currency: 'BRL',
      externalId: 'B3|X',
      notes: 'n',
      status: 'READY',
      issues: [],
    });
    const gated = applyMovementLedgerGates({
      candidates: [preBaselineBuy],
      existing: [
        baseExisting({
          assetId: 'asset-cogn3',
          accountId: 'acc-xp',
          type: 'TRANSFER_IN',
          tradeDate: '2024-12-31',
          quantity: '120',
          unitPrice: null,
        }),
      ],
    });
    expect(gated[0]!.status).toBe('NEEDS_REVIEW');
    expect(
      gated[0]!.issues.some((i) => i.code === 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT'),
    ).toBe(true);
    // Never READY, never silently importable: confirming as-is would double-count.
    expect(gated[0]!.status).not.toBe('READY');
  });

  it('never fabricates disposals for outflows without source rows (EGIE3 rule)', async () => {
    const buffer = await movementBuffer([
      row('Credito', '28/11/2025', 'Bonificação em Ativos', 'EGIE3 - ENGIE', '80'),
      row('Credito', '29/12/2025', 'Empréstimo', 'EGIE3 - ENGIE', '280'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    const bonus = mapped.candidates.filter((c) => c.operation === 'BONUS');
    expect(bonus).toHaveLength(1);
    expect(mapped.candidates.some((c) => c.operation === 'SELL')).toBe(false);
    expect(mapped.candidates.some((c) => c.operation === 'TRANSFER_OUT')).toBe(false);
  });

  it('summarizes preview groups with clear denominators', async () => {
    const buffer = await movementBuffer([
      row('Credito', '29/12/2025', 'Bonificação em Ativos', 'COGN3 - COGNA', '30'),
      row('Credito', '23/10/2026', 'Rendimento', 'SNAG11 - SUNO', '1846', '0,12', '221,52'),
      row('Credito', '07/08/2026', 'Atualização', 'COGN3 - COGNA', '330'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    const summary = summarizeMovementPreview(mapped.candidates, mapped.notices);
    expect(summary.totalRows).toBe(3);
    expect(summary.supportedCustodyEvents).toBe(1);
    expect(summary.cashOnly).toBe(1);
    expect(summary.informational).toBe(1);
    expect(summary.reviewRequired).toBe(0);
    expect(summary.unsupported).toBe(0);
    expect(summary.settlementShadows).toBe(0);
  });

  it('extractMovementRows rejects non-movement sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Negociação');
    ws.addRow(['Data do Negócio', 'Tipo']);
    expect(() => extractMovementRows(ws, 2000)).toThrow();
  });
});
