import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

async function createB3NegotiationXlsxBase64(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Negociação');
  ws.addRow([
    'Data do Negócio',
    'Tipo de Movimentação',
    'Mercado',
    'Prazo/Vencimento',
    'Instituição',
    'Código de Negociação',
    'Quantidade',
    'Preço',
    'Valor',
  ]);
  ws.addRow([
    '15/01/2026',
    'Compra',
    'Mercado à Vista',
    '-',
    'XP INVESTIMENTOS CCTVM S/A.',
    'PETR4',
    100,
    38.5,
    3850,
  ]);
  ws.addRow([
    '20/02/2026',
    'Venda',
    'Mercado à Vista',
    '25/02/2026',
    'NU INVEST CORRETORA DE VALORES S.A.',
    'VALE3',
    50,
    72.1,
    3605,
  ]);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function createB3MovementXlsxBase64(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Movimentação');
  ws.addRow([
    'Entrada/Saída',
    'Data',
    'Movimentação',
    'Produto',
    'Instituição',
    'Quantidade',
    'Preço unitário',
    'Valor da Operação',
  ]);
  ws.addRow(['Credito', '28/10/2026', 'Transferência - Liquidação', 'PETR4', 'XP', 100, 38.5, 3850]);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function createNonB3XlsxBase64(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planilha');
  ws.addRow(['Coluna A', 'Coluna B']);
  ws.addRow(['Valor 1', 'Valor 2']);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

describe('API Integration: Native B3 XLSX Import', () => {
  let app: INestApplication;
  let portfolioId: string;
  let accountId: string;
  let petrId: string;
  let valeId: string;
  let authToken: string;
  const prisma = getTestPrismaClient();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;

    const session = await createAuthenticatedUserSession(fixtures.userId);
    authToken = session.token;

    const petr = await prisma.asset.create({
      data: {
        id: '55555555-5555-4555-8555-555555555555',
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    petrId = petr.id;

    const vale = await prisma.asset.create({
      data: {
        id: '66666666-6666-4666-8666-666666666666',
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    valeId = vale.id;
  });

  function previewUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/imports/preview`;
  }

  function confirmUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/imports/confirm`;
  }

  describe('Preview B3 Negotiation XLSX', () => {
    it('parses a clean B3 negotiation XLSX and reports READY candidates without ledger writes', async () => {
      const base64Content = await createB3NegotiationXlsxBase64();

      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-2026-10-29.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
        })
        .expect(200);

      const preview = res.body.data;
      expect(preview.sourceType).toBe('B3_NEGOTIATION_XLSX');
      expect(preview.provider).toBe('B3');
      expect(preview.candidates).toHaveLength(2);
      expect(preview.summary.totalRows).toBe(2);
      expect(preview.summary.ready).toBe(2);
      expect(preview.summary.duplicates).toBe(0);

      // Verify row 1
      const row1 = preview.candidates[0];
      expect(row1.tradeDate).toBe('2026-01-15');
      expect(row1.ticker).toBe('PETR4');
      expect(row1.assetId).toBe(petrId);
      expect(row1.accountId).toBe(accountId);
      expect(row1.operation).toBe('BUY');
      expect(row1.quantity).toBe('100');
      expect(row1.unitPrice).toBe('38.5');
      expect(row1.fees).toBe('0');
      expect(row1.brokerLabel).toBe('XP INVESTIMENTOS CCTVM S/A.');
      expect(row1.status).toBe('READY');

      // Verify row 2
      const row2 = preview.candidates[1];
      expect(row2.tradeDate).toBe('2026-02-20');
      expect(row2.ticker).toBe('VALE3');
      expect(row2.assetId).toBe(valeId);
      expect(row2.operation).toBe('SELL');
      expect(row2.quantity).toBe('50');
      expect(row2.unitPrice).toBe('72.1');
      expect(row2.brokerLabel).toBe('NU INVEST CORRETORA DE VALORES S.A.');
      expect(row2.settlementDate).toBe('2026-02-25');
      expect(row2.status).toBe('READY');

      // Zero ledger writes gate
      const txCount = await prisma.transaction.count({ where: { portfolioId } });
      expect(txCount).toBe(0);
    });

    it('rejects unsupported B3 Movimentação file with specific informative message', async () => {
      const base64Content = await createB3MovementXlsxBase64();

      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'movimentacao-2026-10-29.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
        })
        .expect(400);

      expect(res.body.code).toBe('IMPORT.INVALID_INPUT');
      expect(res.body.message).toContain('Arquivo B3 reconhecido (Movimentação), mas este tipo ainda não é suportado');
    });

    it('rejects non-B3 XLSX with clear error', async () => {
      const base64Content = await createNonB3XlsxBase64();

      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'planilha.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
        })
        .expect(400);

      expect(res.body.code).toBe('IMPORT.INVALID_INPUT');
      expect(res.body.message).toContain('Arquivo Excel não reconhecido como formato oficial da B3');
    });
  });

  describe('Confirm B3 Negotiation XLSX', () => {
    it('writes READY rows as canonical B3 transactions and is idempotent on repeat', async () => {
      const base64Content = await createB3NegotiationXlsxBase64();

      // 1. Preview
      const previewRes = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-2026-10-29.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
        })
        .expect(200);

      const runId = previewRes.body.data.runId;

      // 2. Confirm
      const confirmRes = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-2026-10-29.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
          runId,
          decisions: [],
        })
        .expect(201);

      const receipt = confirmRes.body.data;
      expect(receipt.created).toBe(2);
      expect(receipt.skippedDuplicates).toBe(0);

      // Verify transactions in ledger
      const txs = await prisma.transaction.findMany({
        where: { portfolioId },
        orderBy: { tradeDate: 'asc' },
      });
      expect(txs).toHaveLength(2);
      expect(txs[0]!.source).toBe('B3');
      expect(txs[0]!.type).toBe('BUY');
      expect(txs[0]!.quantity.toString()).toBe('100');
      expect(txs[1]!.source).toBe('B3');
      expect(txs[1]!.type).toBe('SELL');
      expect(txs[1]!.quantity.toString()).toBe('50');

      // 3. Re-importing same file: Preview reports all rows as DUPLICATE
      const secondPreview = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-segunda-vez.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
        })
        .expect(200);

      expect(secondPreview.body.data.summary.ready).toBe(0);
      expect(secondPreview.body.data.summary.duplicates).toBe(2);

      // 4. Confirming again: 0 new transactions created
      const secondConfirm = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-segunda-vez.xlsx',
          content: base64Content,
          defaultAccountId: accountId,
          runId: secondPreview.body.data.runId,
          decisions: [],
        })
        .expect(201);

      expect(secondConfirm.body.data.created).toBe(0);
      expect(secondConfirm.body.data.skippedDuplicates).toBe(2);

      // Ledger count still exactly 2
      const finalCount = await prisma.transaction.count({ where: { portfolioId } });
      expect(finalCount).toBe(2);
    });
  });
});
