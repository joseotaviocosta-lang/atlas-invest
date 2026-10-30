import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  applyMovementLedgerGates,
  canonicalFingerprint,
  classifyOne,
  mapOperation,
  normalizeRow,
  parentTickerOfSubscriptionRight,
  parseB3MovementXlsx,
  resolveAccount,
  resolveAsset,
} from '@atlas/import-engine';
import type { ExistingLedgerRow, NormalizedCandidate } from '@atlas/import-engine';

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
const FILE = 'movimentacao-sub-test.xlsx';

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

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';

function subCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    rowNumber: 379,
    tradeDate: '2026-04-13',
    ticker: 'SNAG11',
    operation: 'SUBSCRIPTION',
    rawOperation: 'Direitos de Subscrição - Exercido',
    quantity: '100',
    unitPrice: '10.50',
    fees: '0',
    currency: 'BRL',
    status: 'READY',
    issues: [],
    ...overrides,
  };
}

describe('B3 subscription exercise (SNAG-shaped)', () => {
  it('maps exercised rights with factual price to a parent SUBSCRIPTION candidate', async () => {
    const buffer = await movementBuffer([
      row(
        'Debito',
        '13/04/2026',
        'Direitos de Subscrição - Exercido',
        'SNAG12 - SUNO AGRO - FIAGRO-IMOBILIARIO',
        '100',
        '10,50',
        '1050',
      ),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.notices).toHaveLength(0);
    expect(mapped.candidates).toHaveLength(1);
    const c = mapped.candidates[0]!;
    expect(c.operation).toBe('SUBSCRIPTION');
    expect(c.ticker).toBe('SNAG11');
    expect(c.quantity).toBe('100');
    expect(c.unitPrice).toBe('10.50');
    expect(c.tradeDate).toBe('2026-04-13');
    expect(c.status).toBe('READY');
    expect(c.notes).toContain('SNAG12');
    expect(c.externalId).toContain('PARENT:SNAG11');
  });

  it('keeps exercised rights without price in review (never READY, never zero)', async () => {
    const buffer = await movementBuffer([
      row(
        'Debito',
        '13/04/2026',
        'Direitos de Subscrição - Exercido',
        'SNAG12 - SUNO AGRO - FIAGRO-IMOBILIARIO',
        '100',
      ),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices).toHaveLength(1);
    expect(mapped.notices[0]!.reasonCode).toBe('SUBSCRIPTION_WITHOUT_PRICE');
    expect(mapped.notices[0]!.group).toBe('REVIEW_REQUIRED');
  });

  it('rejects zero exercise price (zero-cost fabrication impossible)', async () => {
    const buffer = await movementBuffer([
      row(
        'Debito',
        '13/04/2026',
        'Direitos de Subscrição - Exercido',
        'SNAG12 - SUNO AGRO - FIAGRO-IMOBILIARIO',
        '100',
        '0',
        '-',
      ),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices[0]!.reasonCode).toBe('SUBSCRIPTION_WITHOUT_PRICE');
  });

  it('never models subscription lifecycle as SELL+BUY', async () => {
    const buffer = await movementBuffer([
      row(
        'Debito',
        '13/04/2026',
        'Direitos de Subscrição - Exercido',
        'SNAG12 - SUNO AGRO',
        '100',
        '10,50',
        '1050',
      ),
      row('Credito', '30/03/2026', 'Recibo de Subscrição', 'SNAG13 - SUNO AGRO', '100'),
      row('Credito', '25/05/2026', 'Atualização', 'SNAG11 - SUNO AGRO', '100'),
      row('Credito', '02/09/2026', 'Cessão de Direitos', 'HGLG12 - PATRIA LOG', '11'),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    const ops = mapped.candidates.map((c) => c.operation);
    expect(ops).not.toContain('SELL');
    expect(ops).not.toContain('BUY');
    expect(ops).toEqual(['SUBSCRIPTION']);
  });

  it('holds receipts, sobras, cessions and expiries out of the ledger', async () => {
    const buffer = await movementBuffer([
      row('Credito', '30/03/2026', 'Recibo de Subscrição', 'SNAG13 - SUNO AGRO', '100'),
      row('Credito', '01/04/2026', 'Direito Sobras de Subscrição', 'SNAG12 - SUNO AGRO', '1598'),
      row('Debito', '27/03/2026', 'Solicitação de Subscrição', 'SNAG12 - SUNO AGRO', '100'),
      row('Credito', '27/03/2026', 'Cessão de Direitos', 'SNAG12 - SUNO AGRO', '1316'),
      row(
        'Debito',
        '09/07/2026',
        'Direitos de Subscrição - Não Exercido',
        'MXRF12 - MAXI RENDA',
        '0',
      ),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices).toHaveLength(5);
  });

  it('derives FII parent tickers and never guesses stock-right parents', () => {
    expect(parentTickerOfSubscriptionRight('SNAG12')).toBe('SNAG11');
    expect(parentTickerOfSubscriptionRight('MXRF12')).toBe('MXRF11');
    expect(parentTickerOfSubscriptionRight('PMLL12')).toBe('PMLL11');
    expect(parentTickerOfSubscriptionRight('HYPE1')).toBeNull();
    expect(parentTickerOfSubscriptionRight('SNAG11')).toBeNull();
  });

  it('holds exercised rights with underivable parents in review', async () => {
    const buffer = await movementBuffer([
      row(
        'Debito',
        '16/03/2026',
        'Direitos de Subscrição - Exercido',
        'HYPE1 - HYPERA S.A.',
        '22',
        '10,00',
        '220',
      ),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates).toHaveLength(0);
    expect(mapped.notices[0]!.reasonCode).toBe('SUBSCRIPTION_PARENT_UNRESOLVED');
  });

  it('downgrades pre-baseline subscriptions covered by the opening snapshot', () => {
    const classified = {
      ...subCandidate({ tradeDate: '2024-12-27' }),
      assetId: ASSET,
      assetResolution: 'RESOLVED' as const,
      accountId: ACCOUNT,
      accountResolution: 'RESOLVED' as const,
      fingerprint: 'fp-sub',
      duplicate: 'NEW' as const,
      provider: 'B3',
    };
    const existing: ExistingLedgerRow[] = [
      {
        provider: 'B3',
        externalId: null,
        assetId: ASSET,
        accountId: ACCOUNT,
        type: 'TRANSFER_IN',
        tradeDate: '2024-12-31',
        quantity: '120',
        unitPrice: null,
        fees: null,
        amount: null,
        currency: 'BRL',
        fingerprint: 'fp-open',
      },
    ];
    const [gated] = applyMovementLedgerGates({ candidates: [classified], existing });
    expect(gated!.status).toBe('NEEDS_REVIEW');
    expect(gated!.issues.some((i) => i.code === 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT')).toBe(
      true,
    );
  });

  it('blocks duplicate subscription confirmation via stable fingerprint', () => {
    const assetMatch = resolveAsset('SNAG11', [
      { id: ASSET, ticker: 'SNAG11', exchange: 'B3', status: 'ACTIVE' },
    ]);
    const accountMatch = resolveAccount('Principal', [{ id: ACCOUNT, name: 'Principal' }]);
    const first = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: subCandidate(),
      assetMatch,
      accountMatch,
      defaultAccountId: null,
      existing: [],
    });
    expect(first.status).toBe('READY');
    expect(first.fingerprint).not.toBeNull();
    const existing: ExistingLedgerRow[] = [
      {
        provider: 'B3',
        externalId: null,
        assetId: ASSET,
        accountId: ACCOUNT,
        type: 'SUBSCRIPTION',
        tradeDate: '2026-04-13',
        quantity: '100',
        unitPrice: '10.50',
        fees: '0',
        amount: null,
        currency: 'BRL',
        fingerprint: canonicalFingerprint({
          portfolioId: PORTFOLIO,
          accountId: ACCOUNT,
          assetId: ASSET,
          type: 'SUBSCRIPTION',
          tradeDate: '2026-04-13',
          quantity: '100',
          unitPrice: '10.50',
          fees: '0',
          currency: 'BRL',
        }),
      },
    ];
    const second = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: subCandidate(),
      assetMatch,
      accountMatch,
      defaultAccountId: null,
      existing,
    });
    expect(second.duplicate).toBe('EXACT_DUPLICATE');
    expect(second.status).toBe('DUPLICATE');
  });
});

describe('Subscription template + normalizer price gate', () => {
  it('maps subscription synonyms to a first-class kind', () => {
    expect(mapOperation('SUBSCRIÇÃO')).toEqual({ kind: 'SUBSCRIPTION' });
    expect(mapOperation('SUBSCRIÇÃO EXERCIDA')).toEqual({ kind: 'SUBSCRIPTION' });
    expect(mapOperation('SUBSCRIPTION')).toEqual({ kind: 'SUBSCRIPTION' });
  });

  it('rejects priceless subscriptions without inventing a price', () => {
    const cells: Record<string, string> = {
      '0': '2026-04-13',
      '1': 'SNAG11',
      '2': 'SUBSCRIÇÃO',
      '3': '100',
      '4': '',
    };
    const out = normalizeRow(
      { rowNumber: 2, cells },
      { date: 0, ticker: 1, operation: 2, quantity: 3, unit_price: 4 },
      { today: TODAY },
    );
    expect(out.operation).toBe('SUBSCRIPTION');
    expect(out.status).toBe('INVALID');
    expect(out.unitPrice).toBe('0');
  });

  it('accepts priced subscriptions as READY', () => {
    const cells: Record<string, string> = {
      '0': '2026-04-13',
      '1': 'SNAG11',
      '2': 'SUBSCRIÇÃO',
      '3': '100',
      '4': '10.50',
    };
    const out = normalizeRow(
      { rowNumber: 2, cells },
      { date: 0, ticker: 1, operation: 2, quantity: 3, unit_price: 4 },
      { today: TODAY },
    );
    expect(out.operation).toBe('SUBSCRIPTION');
    expect(out.status).toBe('READY');
    expect(out.unitPrice).toBe('10.50');
  });
});
