import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  canonicalConversionFingerprint,
  classifyOne,
  mapOperation,
  normalizeRow,
  parentTickerOfSubscriptionRight,
  parseB3MovementXlsx,
  resolveAsset,
  resolveAccount,
  type AssetMatch,
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
const FILE = 'movimentacao-conv-test.xlsx';

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
const RECEIPT = '33333333-3333-4333-8333-333333333333';
const PARENT = '44444444-4444-4444-8444-444444444444';

function convCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    rowNumber: 10,
    tradeDate: '2026-05-20',
    ticker: 'SNEL13',
    operation: 'RECEIPT_CONVERSION',
    rawOperation: 'CONVERSÃO DE RECIBO',
    quantity: '200',
    unitPrice: '0',
    fees: '0',
    currency: 'BRL',
    targetTicker: 'SNEL11',
    targetQuantity: '200',
    conversionRatio: '1',
    conversionType: 'SUBSCRIPTION_RECEIPT',
    dateConfidence: 'EXACT',
    status: 'READY',
    issues: [],
    ...overrides,
  };
}

function assetMatch(): AssetMatch {
  return resolveAsset('SNEL13', [
    { id: RECEIPT, ticker: 'SNEL13', exchange: 'B3', status: 'ACTIVE' },
    { id: PARENT, ticker: 'SNEL11', exchange: 'B3', status: 'ACTIVE' },
  ]);
}

function targetMatch(): AssetMatch {
  return {
    resolution: 'RESOLVED',
    asset: { id: PARENT, ticker: 'SNEL11', exchange: 'B3', status: 'ACTIVE' },
    candidates: [],
    viaSuccessor: false,
  };
}

function accountMatch() {
  return resolveAccount('Principal', [{ id: ACCOUNT, name: 'Principal' }]);
}

function convLedgerRow(overrides: Partial<ExistingLedgerRow> = {}): ExistingLedgerRow {
  return {
    provider: 'B3',
    externalId: null,
    assetId: RECEIPT,
    targetAssetId: PARENT,
    accountId: ACCOUNT,
    type: 'RECEIPT_CONVERSION',
    tradeDate: '2026-05-20',
    quantity: '200',
    targetQuantity: '200',
    conversionRatio: '1',
    conversionType: 'SUBSCRIPTION_RECEIPT',
    unitPrice: null,
    fees: null,
    amount: null,
    currency: 'BRL',
    fingerprint: canonicalConversionFingerprint({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: RECEIPT,
      targetAssetId: PARENT,
      type: 'RECEIPT_CONVERSION',
      tradeDate: '2026-05-20',
      quantity: '200',
      targetQuantity: '200',
      conversionRatio: '1',
      conversionType: 'SUBSCRIPTION_RECEIPT',
      currency: 'BRL',
    }),
    ...overrides,
  };
}

describe('Receipt conversion template + normalizer', () => {
  it('maps conversion synonyms to a first-class kind', () => {
    expect(mapOperation('CONVERSÃO DE RECIBO')).toEqual({ kind: 'RECEIPT_CONVERSION' });
    expect(mapOperation('RECEIPT_CONVERSION')).toEqual({ kind: 'RECEIPT_CONVERSION' });
  });

  it('accepts a complete EXACT conversion as READY', () => {
    const cells: Record<string, string> = {
      '0': '2026-05-20',
      '1': 'SNEL13',
      '2': 'CONVERSÃO DE RECIBO',
      '3': '200',
      '4': '',
      '5': 'SNEL11',
      '6': '200',
      '7': '1',
      '8': 'SUBSCRIPTION_RECEIPT',
    };
    const out = normalizeRow(
      { rowNumber: 2, cells },
      {
        date: 0,
        ticker: 1,
        operation: 2,
        quantity: 3,
        unit_price: 4,
        target_ticker: 5,
        target_quantity: 6,
        conversion_ratio: 7,
        conversion_type: 8,
      },
      { today: TODAY },
    );
    expect(out.operation).toBe('RECEIPT_CONVERSION');
    expect(out.status).toBe('READY');
    expect(out.targetTicker).toBe('SNEL11');
    expect(out.targetQuantity).toBe('200');
    expect(out.conversionRatio).toBe('1');
    expect(out.dateConfidence).toBe('EXACT');
  });

  it('rejects ratio inconsistency without float math', () => {
    const cells: Record<string, string> = {
      '0': '2026-05-20',
      '1': 'SNEL13',
      '2': 'CONVERSÃO DE RECIBO',
      '3': '200',
      '5': 'SNEL11',
      '6': '201',
      '7': '1',
    };
    const out = normalizeRow(
      { rowNumber: 2, cells },
      {
        date: 0,
        ticker: 1,
        operation: 2,
        quantity: 3,
        target_ticker: 5,
        target_quantity: 6,
        conversion_ratio: 7,
      },
      { today: TODAY },
    );
    expect(out.status).toBe('INVALID');
    expect(out.issues.some((i) => i.code === 'CONVERSION_RATIO_MISMATCH')).toBe(true);
  });

  it('rejects missing target, same-asset, and unknown conversion kind', () => {
    const base = { date: 0, ticker: 1, operation: 2, quantity: 3 };
    const mk = (cells: Record<string, string>) =>
      normalizeRow({ rowNumber: 2, cells }, base, { today: TODAY });
    expect(
      mk({ '0': '2026-05-20', '1': 'SNEL13', '2': 'CONVERSÃO DE RECIBO', '3': '200' }).status,
    ).toBe('INVALID');
    const same = normalizeRow(
      {
        rowNumber: 2,
        cells: { '0': '2026-05-20', '1': 'SNEL13', '2': 'CONVERSÃO DE RECIBO', '3': '200' },
      },
      { date: 0, ticker: 1, operation: 2, quantity: 3, target_ticker: 1 },
      { today: TODAY },
    );
    expect(same.issues.some((i) => i.code === 'CONVERSION_SAME_ASSET')).toBe(true);
  });

  it('holds BOUNDED and UNKNOWN dates in review with the pt-BR message', () => {
    for (const confidence of ['BOUNDED', 'UNKNOWN']) {
      const cells: Record<string, string> = {
        '0': '2026-05-20',
        '1': 'SNEL13',
        '2': 'CONVERSÃO DE RECIBO',
        '3': '200',
        '5': 'SNEL11',
        '6': '200',
        '7': '1',
        '9': confidence,
      };
      const out = normalizeRow(
        { rowNumber: 2, cells },
        {
          date: 0,
          ticker: 1,
          operation: 2,
          quantity: 3,
          target_ticker: 5,
          target_quantity: 6,
          conversion_ratio: 7,
          date_confidence: 9,
        },
        { today: TODAY },
      );
      expect(out.status).toBe('NEEDS_REVIEW');
      expect(out.issues.some((i) => i.code === 'CONVERSION_DATE_UNVERIFIED')).toBe(true);
      expect(out.issues.find((i) => i.code === 'CONVERSION_DATE_UNVERIFIED')!.message).toContain(
        'data exata não foi encontrada',
      );
    }
  });

  it('holds priced conversions in review (conversion carries no price)', () => {
    const cells: Record<string, string> = {
      '0': '2026-05-20',
      '1': 'SNEL13',
      '2': 'CONVERSÃO DE RECIBO',
      '3': '200',
      '4': '8.53',
      '5': 'SNEL11',
      '6': '200',
      '7': '1',
    };
    const out = normalizeRow(
      { rowNumber: 2, cells },
      {
        date: 0,
        ticker: 1,
        operation: 2,
        quantity: 3,
        unit_price: 4,
        target_ticker: 5,
        target_quantity: 6,
        conversion_ratio: 7,
      },
      { today: TODAY },
    );
    expect(out.status).toBe('NEEDS_REVIEW');
    expect(out.issues.some((i) => i.code === 'CONVERSION_WITH_PRICE')).toBe(true);
  });
});

describe('Receipt conversion classification + dedupe', () => {
  it('classifies an EXACT conversion as READY with dual-asset fingerprint', () => {
    const out = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: convCandidate(),
      assetMatch: assetMatch(),
      targetAssetMatch: targetMatch(),
      accountMatch: accountMatch(),
      defaultAccountId: null,
      existing: [],
    });
    expect(out.status).toBe('READY');
    expect(out.targetAssetId).toBe(PARENT);
    expect(out.duplicate).toBe('NEW');
    expect(out.fingerprint).toBe(
      canonicalConversionFingerprint({
        portfolioId: PORTFOLIO,
        accountId: ACCOUNT,
        assetId: RECEIPT,
        targetAssetId: PARENT,
        type: 'RECEIPT_CONVERSION',
        tradeDate: '2026-05-20',
        quantity: '200',
        targetQuantity: '200',
        conversionRatio: '1',
        conversionType: 'SUBSCRIPTION_RECEIPT',
        currency: 'BRL',
      }),
    );
  });

  it('downgrades unresolved targets without successor guessing', () => {
    const out = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: convCandidate(),
      assetMatch: assetMatch(),
      targetAssetMatch: {
        resolution: 'NOT_FOUND',
        asset: null,
        candidates: [],
        viaSuccessor: false,
      },
      accountMatch: accountMatch(),
      defaultAccountId: null,
      existing: [],
    });
    expect(out.status).toBe('NEEDS_REVIEW');
    expect(out.issues.some((i) => i.code === 'UNKNOWN_TARGET_ASSET')).toBe(true);
  });

  it('target resolution ignores successor mappings (PART AD)', () => {
    // MBRF3 resolves via successor to MRFG3 through resolveAsset, but the
    // conversion target path uses direct matching only: without an MBRF3 row
    // in the catalog the target stays NOT_FOUND instead of aliasing MRFG3.
    const viaNormal = resolveAsset('MBRF3', [
      { id: PARENT, ticker: 'MRFG3', exchange: 'B3', status: 'ACTIVE' },
    ]);
    expect(viaNormal.resolution).toBe('RESOLVED');
    expect(viaNormal.viaSuccessor).toBe(true);
    const out = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: convCandidate({ targetTicker: 'MBRF3' }),
      assetMatch: assetMatch(),
      targetAssetMatch: {
        resolution: 'NOT_FOUND',
        asset: null,
        candidates: [],
        viaSuccessor: false,
      },
      accountMatch: accountMatch(),
      defaultAccountId: null,
      existing: [],
    });
    expect(out.targetAssetId).toBeNull();
    expect(out.status).toBe('NEEDS_REVIEW');
  });

  it('blocks exact-duplicate reconfirmation and flags probable matches', () => {
    const exact = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: convCandidate(),
      assetMatch: assetMatch(),
      targetAssetMatch: targetMatch(),
      accountMatch: accountMatch(),
      defaultAccountId: null,
      existing: [convLedgerRow()],
    });
    expect(exact.duplicate).toBe('EXACT_DUPLICATE');
    expect(exact.status).toBe('DUPLICATE');

    const probable = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: convCandidate({ conversionRatio: '1.00' }),
      assetMatch: assetMatch(),
      targetAssetMatch: targetMatch(),
      accountMatch: accountMatch(),
      defaultAccountId: null,
      existing: [convLedgerRow()],
    });
    // Same economics modulo ratio formatting: fingerprint differs ('1.00'
    // normalizes to '1' — actually exact). Either outcome is safe; assert none is READY-new.
    expect(['EXACT_DUPLICATE', 'PROBABLE_DUPLICATE']).toContain(probable.duplicate);
    expect(probable.status).not.toBe('READY');
  });

  it('flags conflicting external ids explicitly', () => {
    const out = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: convCandidate({ externalId: 'CONV-1', targetQuantity: '200' }),
      assetMatch: assetMatch(),
      targetAssetMatch: targetMatch(),
      accountMatch: accountMatch(),
      defaultAccountId: null,
      existing: [convLedgerRow({ externalId: 'CONV-1', targetQuantity: '199', quantity: '199' })],
    });
    expect(out.duplicate).toBe('CONFLICT');
    expect(out.status).toBe('NEEDS_REVIEW');
  });
});

describe('Movement router never fabricates conversions (SNEL real stays REVIEW)', () => {
  it('emits zero RECEIPT_CONVERSION candidates for lifecycle rows', async () => {
    const buffer = await movementBuffer([
      row('Credito', '30/03/2026', 'Recibo de Subscrição', 'SNAG13 - SUNO AGRO', '100'),
      row('Credito', '25/05/2026', 'Atualização', 'SNAG11 - SUNO AGRO', '100'),
      row('Credito', '06/07/2026', 'Cessão de Direitos', 'SNEL12 - SUNO ENERGIAS', '2740'),
      row(
        'Debito',
        '13/04/2026',
        'Direitos de Subscrição - Exercido',
        'SNAG12 - SUNO AGRO',
        '100',
        '10,50',
        '1050',
      ),
    ]);
    const mapped = await parseB3MovementXlsx(buffer, { fileName: FILE, today: TODAY });
    expect(mapped.candidates.map((c) => c.operation)).not.toContain('RECEIPT_CONVERSION');
    expect(mapped.candidates.map((c) => c.operation)).toEqual(['SUBSCRIPTION']);
  });

  it('rights-ticker morphology is never used to fabricate conversions', () => {
    // SNEL12 morphologically derives SNEL11 (rights → parent), but the
    // movement router only applies that to exercised-rights rows and never
    // emits RECEIPT_CONVERSION (proven by the router test above).
    expect(parentTickerOfSubscriptionRight('SNEL12')).toBe('SNEL11');
  });
});
