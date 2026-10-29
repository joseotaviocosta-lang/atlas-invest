import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { UniqueAssetSummary, UniqueInstitutionSummary } from '@atlas/import-engine';
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

async function createMultiAssetInstitutionB3XlsxBase64(): Promise<string> {
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
  // ITSA4 (Stock) via XP
  ws.addRow(['10/01/2026', 'Compra', 'Mercado à Vista', '-', 'XP INVESTIMENTOS CCTVM S/A.', 'ITSA4', 200, 10.5, 2100]);
  // JHSF3 (Stock) via XP
  ws.addRow(['12/01/2026', 'Compra', 'Mercado à Vista', '-', 'XP INVESTIMENTOS CCTVM S/A', 'JHSF3', 500, 4.2, 2100]);
  // IRIM11 (FII) via NuInvest
  ws.addRow(['15/01/2026', 'Compra', 'Mercado à Vista', '-', 'NU INVESTIMENTOS S.A. - CTVM', 'IRIM11', 50, 80.0, 4000]);
  // ROXO34 (BDR) via NuInvest
  ws.addRow(['18/01/2026', 'Compra', 'Mercado à Vista', '-', 'NU INVESTIMENTOS S.A. - CTVM', 'ROXO34', 100, 12.0, 1200]);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

async function create59RowB3XlsxBase64(): Promise<string> {
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
  // 58 XP rows with legal name variations (with dot and without dot)
  const tickers = ['ITSA4', 'JHSF3', 'BBAS3', 'EZTC3', 'PETR4', 'VALE3', 'HGLG11', 'IRIM11'];
  for (let i = 1; i <= 58; i++) {
    const ticker = tickers[i % tickers.length]!;
    // Alternate broker name syntax like real B3 files
    const broker = i % 2 === 0 ? 'XP INVESTIMENTOS CCTVM S/A.' : 'XP INVESTIMENTOS CCTVM S/A';
    const op = i % 5 === 0 ? 'Venda' : 'Compra';
    ws.addRow([
      `15/01/2026`,
      op,
      'Mercado à Vista',
      '-',
      broker,
      ticker,
      10 * i,
      10.0 + (i % 5),
      (10 * i) * (10.0 + (i % 5)),
    ]);
  }
  // 1 Nubank row
  ws.addRow([
    '20/01/2026',
    'Compra',
    'Mercado à Vista',
    '-',
    'NU INVESTIMENTOS S.A. - CTVM',
    'ROXO34',
    100,
    15.0,
    1500,
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

    it('auto-resolves and provisions unseeded B3 assets (ITSA4, JHSF3, IRIM11, ROXO34) and auto-matches accounts by institution', async () => {
      // Create institutions and accounts for XP and NuInvest
      const xpInst = await prisma.institution.create({
        data: {
          id: 'b0000000-0000-4000-8000-000000000010',
          name: 'XP Investimentos',
          type: 'BROKER',
          country: 'BR',
        },
      });
      const nuInst = await prisma.institution.create({
        data: {
          id: 'b0000000-0000-4000-8000-000000000020',
          name: 'Nubank / NuInvest',
          type: 'BROKER',
          country: 'BR',
        },
      });
      const xpAccount = await prisma.account.create({
        data: {
          id: 'd0000000-0000-4000-8000-000000000010',
          portfolioId,
          institutionId: xpInst.id,
          name: 'XP Conta Principal',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      });
      const nuAccount = await prisma.account.create({
        data: {
          id: 'd0000000-0000-4000-8000-000000000020',
          portfolioId,
          institutionId: nuInst.id,
          name: 'NuInvest Custódia',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      });

      // Verify that ITSA4, JHSF3, IRIM11, ROXO34 do NOT exist initially in DB
      const initialAssets = await prisma.asset.findMany({
        where: { ticker: { in: ['ITSA4', 'JHSF3', 'IRIM11', 'ROXO34'] } },
      });
      expect(initialAssets).toHaveLength(0);

      const base64Content = await createMultiAssetInstitutionB3XlsxBase64();

      // 1. Preview
      const previewRes = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-multi-ativos.xlsx',
          content: base64Content,
        })
        .expect(200);

      const data = previewRes.body.data;
      expect(data.summary.totalRows).toBe(4);
      expect(data.summary.ready).toBe(4);
      expect(data.summary.needsReview).toBe(0);
      expect(data.summary.duplicates).toBe(0);

      // Verify assetSummary
      expect(data.assetSummary).toHaveLength(4);
      expect(data.assetSummary.every((a: UniqueAssetSummary) => a.status === 'RESOLVED')).toBe(true);

      // Verify institutionSummary
      expect(data.institutionSummary).toHaveLength(2);
      const xpSummary = data.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'XP Investimentos');
      expect(xpSummary).toBeDefined();
      expect(xpSummary.matchedAccountId).toBe(xpAccount.id);
      expect(xpSummary.status).toBe('RESOLVED');

      const nuSummary = data.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'Nubank / NuInvest');
      expect(nuSummary).toBeDefined();
      expect(nuSummary.matchedAccountId).toBe(nuAccount.id);
      expect(nuSummary.status).toBe('RESOLVED');

      // Verify that assets were metadata-provisioned in DB
      const provisionedAssets = await prisma.asset.findMany({
        where: { ticker: { in: ['ITSA4', 'JHSF3', 'IRIM11', 'ROXO34'] } },
      });
      expect(provisionedAssets).toHaveLength(4);
      const itsa = provisionedAssets.find((a) => a.ticker === 'ITSA4');
      expect(itsa?.type).toBe('STOCK');
      const irim = provisionedAssets.find((a) => a.ticker === 'IRIM11');
      expect(irim?.type).toBe('FII');
      const roxo = provisionedAssets.find((a) => a.ticker === 'ROXO34');
      expect(roxo?.type).toBe('BDR');

      // Zero transactions in ledger (ledger delta = 0)
      const txCountBefore = await prisma.transaction.count({ where: { portfolioId } });
      expect(txCountBefore).toBe(0);

      // 2. Confirm
      const confirmRes = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-multi-ativos.xlsx',
          content: base64Content,
          runId: data.runId,
          decisions: [],
        })
        .expect(201);

      expect(confirmRes.body.data.created).toBe(4);

      // Verify ledger transactions
      const txs = await prisma.transaction.findMany({
        where: { portfolioId },
        orderBy: { tradeDate: 'asc' },
      });
      expect(txs).toHaveLength(4);
      // XP operations mapped to XP account
      const xpTxs = txs.filter((t) => t.accountId === xpAccount.id);
      expect(xpTxs).toHaveLength(2);
      // Nu operations mapped to Nu account
      const nuTxs = txs.filter((t) => t.accountId === nuAccount.id);
      expect(nuTxs).toHaveLength(2);
    });

    it('handles new empty portfolio with 0 accounts by reporting NEEDS_ACCOUNT in institutionSummary', async () => {
      // Create empty portfolio with 0 accounts
      const user = await prisma.user.findFirst();
      const emptyPortfolio = await prisma.portfolio.create({
        data: {
          id: '33333333-3333-4333-8333-000000000099',
          userId: user!.id,
          name: 'Carteira Vazia',
          baseCurrency: 'BRL',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      });

      const base64Content = await createMultiAssetInstitutionB3XlsxBase64();

      const previewRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${emptyPortfolio.id}/imports/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-carteira-vazia.xlsx',
          content: base64Content,
        })
        .expect(200);

      const data = previewRes.body.data;
      expect(data.summary.totalRows).toBe(4);
      // Because no accounts exist, rows need account assignment (needsReview)
      expect(data.summary.needsReview).toBe(4);
      expect(data.summary.ready).toBe(0);

      // But all assets are resolved
      expect(data.assetSummary).toHaveLength(4);
      expect(data.assetSummary.every((a: UniqueAssetSummary) => a.status === 'RESOLVED')).toBe(true);

      // Institutions report NEEDS_ACCOUNT
      expect(data.institutionSummary).toHaveLength(2);
      expect(data.institutionSummary.every((i: UniqueInstitutionSummary) => i.status === 'NEEDS_ACCOUNT')).toBe(true);
      expect(data.institutionSummary.every((i: UniqueInstitutionSummary) => i.matchedAccountId === null)).toBe(true);

      // Zero transactions
      const txCount = await prisma.transaction.count({ where: { portfolioId: emptyPortfolio.id } });
      expect(txCount).toBe(0);
    });

    it('synchronizes batch account resolution: 58 XP rows + 1 Nubank row transition from NEEDS_REVIEW to READY upon account creation', async () => {
      // 1. Create a brand new empty portfolio with 0 accounts
      const user = await prisma.user.findFirst();
      const testPortfolio = await prisma.portfolio.create({
        data: {
          id: '59595959-5959-4959-8959-000000000059',
          userId: user!.id,
          name: 'Carteira 59 Linhas',
          baseCurrency: 'BRL',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      });

      // Ensure institutions XP and Nubank exist in the institution catalog
      let xpInst = await prisma.institution.findFirst({ where: { name: 'XP Investimentos' } });
      if (!xpInst) {
        xpInst = await prisma.institution.create({
          data: {
            id: 'b0000000-0000-4000-8000-000000000010',
            name: 'XP Investimentos',
            type: 'BROKER',
            country: 'BR',
          },
        });
      }
      let nuInst = await prisma.institution.findFirst({ where: { name: 'Nubank / NuInvest' } });
      if (!nuInst) {
        nuInst = await prisma.institution.create({
          data: {
            id: 'b0000000-0000-4000-8000-000000000020',
            name: 'Nubank / NuInvest',
            type: 'BROKER',
            country: 'BR',
          },
        });
      }

      const base64Content = await create59RowB3XlsxBase64();

      // Step 1: Initial preview with 0 accounts in portfolio
      const preview1 = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${testPortfolio.id}/imports/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-59.xlsx',
          content: base64Content,
        })
        .expect(200);

      const d1 = preview1.body.data;
      expect(d1.summary.totalRows).toBe(59);
      expect(d1.summary.ready).toBe(0);
      expect(d1.summary.needsReview).toBe(59);
      expect(d1.summary.duplicates).toBe(0);

      // Verify institution summary has 58 XP and 1 Nubank
      const xpInstSummary1 = d1.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'XP Investimentos');
      expect(xpInstSummary1).toBeDefined();
      expect(xpInstSummary1.rowCount).toBe(58);
      expect(xpInstSummary1.operationCount).toBe(58);
      expect(xpInstSummary1.uniqueAssetCount).toBe(8);
      expect(xpInstSummary1.rawNames).toContain('xp investimentos cctvm s/a.');
      expect(xpInstSummary1.rawNames).toContain('xp investimentos cctvm s/a');
      expect(xpInstSummary1.status).toBe('NEEDS_ACCOUNT');

      const nuInstSummary1 = d1.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'Nubank / NuInvest');
      expect(nuInstSummary1).toBeDefined();
      expect(nuInstSummary1.rowCount).toBe(1);
      expect(nuInstSummary1.operationCount).toBe(1);
      expect(nuInstSummary1.uniqueAssetCount).toBe(1);
      expect(nuInstSummary1.status).toBe('NEEDS_ACCOUNT');

      // Global invariant: sum of operationCount equals total rows
      const totalOps = d1.institutionSummary.reduce((sum: number, i: UniqueInstitutionSummary) => sum + i.operationCount, 0);
      expect(totalOps).toBe(59);

      // Verify every candidate carries normalizedInstitution
      expect(d1.candidates.every((c: { normalizedInstitution?: string }) => Boolean(c.normalizedInstitution))).toBe(true);

      // Step 2: Create XP account in the portfolio
      const xpAccountRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${testPortfolio.id}/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'XP Investimentos',
          institutionId: xpInst.id,
          currency: 'BRL',
        })
        .expect(201);
      const xpAccount = xpAccountRes.body.data;

      // Re-run preview after XP account creation
      const preview2 = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${testPortfolio.id}/imports/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-59.xlsx',
          content: base64Content,
        })
        .expect(200);

      const d2 = preview2.body.data;
      expect(d2.summary.totalRows).toBe(59);
      expect(d2.summary.ready).toBe(58); // All 58 XP rows are now READY!
      expect(d2.summary.needsReview).toBe(1); // Only the 1 Nubank row remains
      expect(d2.summary.duplicates).toBe(0);

      const xpInstSummary2 = d2.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'XP Investimentos');
      expect(xpInstSummary2.status).toBe('RESOLVED');
      expect(xpInstSummary2.matchedAccountId).toBe(xpAccount.id);

      const nuInstSummary2 = d2.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'Nubank / NuInvest');
      expect(nuInstSummary2.status).toBe('NEEDS_ACCOUNT');

      // Step 3: Create Nubank account in the portfolio
      const nuAccountRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${testPortfolio.id}/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Nubank / NuInvest',
          institutionId: nuInst.id,
          currency: 'BRL',
        })
        .expect(201);
      const nuAccount = nuAccountRes.body.data;

      // Re-run preview after Nubank account creation
      const preview3 = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${testPortfolio.id}/imports/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-59.xlsx',
          content: base64Content,
        })
        .expect(200);

      const d3 = preview3.body.data;
      expect(d3.summary.totalRows).toBe(59);
      expect(d3.summary.ready).toBe(59); // All 59 rows are READY!
      expect(d3.summary.needsReview).toBe(0);
      expect(d3.summary.duplicates).toBe(0);

      const xpInstSummary3 = d3.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'XP Investimentos');
      expect(xpInstSummary3.status).toBe('RESOLVED');
      const nuInstSummary3 = d3.institutionSummary.find((i: UniqueInstitutionSummary) => i.normalizedName === 'Nubank / NuInvest');
      expect(nuInstSummary3.status).toBe('RESOLVED');

      // Invariant: zero ledger writes before confirmation
      const txCountBeforeConfirm = await prisma.transaction.count({ where: { portfolioId: testPortfolio.id } });
      expect(txCountBeforeConfirm).toBe(0);

      // Step 4: Confirm import without overrides (clean execution)
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${testPortfolio.id}/imports/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_NEGOTIATION_XLSX',
          fileName: 'negociacao-59.xlsx',
          content: base64Content,
          runId: d3.runId,
          decisions: [],
        })
        .expect(201);

      expect(confirmRes.body.data.created).toBe(59);

      // Step 5: Verify ledger transactions
      const txs = await prisma.transaction.findMany({ where: { portfolioId: testPortfolio.id } });
      expect(txs).toHaveLength(59);
      expect(txs.filter((t) => t.accountId === xpAccount.id)).toHaveLength(58);
      expect(txs.filter((t) => t.accountId === nuAccount.id)).toHaveLength(1);
    });
  });

  describe('B3 Annual Consolidated Report Import (Opening Position Baseline)', () => {
    it('previews and confirms B3 Annual Report establishing baseline custody via TRANSFER_IN at 31/12/2024', async () => {
      let xpInst = await prisma.institution.findFirst({ where: { name: 'XP Investimentos' } });
      if (!xpInst) {
        xpInst = await prisma.institution.create({
          data: {
            id: 'b0000000-0000-4000-8000-000000000010',
            name: 'XP Investimentos',
            type: 'BROKER',
            country: 'BR',
          },
        });
      }
      let nuInst = await prisma.institution.findFirst({ where: { name: 'Nubank / NuInvest' } });
      if (!nuInst) {
        nuInst = await prisma.institution.create({
          data: {
            id: 'b0000000-0000-4000-8000-000000000020',
            name: 'Nubank / NuInvest',
            type: 'BROKER',
            country: 'BR',
          },
        });
      }

      // Accounts in portfolio via API
      await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'XP Investimentos',
          institutionId: xpInst.id,
          currency: 'BRL',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Nubank / NuInvest',
          institutionId: nuInst.id,
          currency: 'BRL',
        })
        .expect(201);

      // Create annual report workbook with normal + loaned custody
      const wb = new ExcelJS.Workbook();
      const wsAcoes = wb.addWorksheet('Posição - Ações');
      wsAcoes.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      wsAcoes.addRow(['ITSA4 - ITAUSA S.A.', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'ITSA4', '1.161,3']);
      wsAcoes.addRow(['SAPR4 - SANEPAR', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'SAPR4', '3300']);
      wsAcoes.addRow(['HYPE3 - HYPERA S.A.', 'XP INVESTIMENTOS CCTVM S/A', '395072', 'HYPE3', '116']);
      wsAcoes.addRow(['Total', '', '', '', '4577.3']);

      const wsBdr = wb.addWorksheet('Posição - BDR');
      wsBdr.addRow(['Produto', 'Instituição', 'Conta', 'Código de Negociação', 'Quantidade']);
      wsBdr.addRow(['ROXO34 - NU HOLDINGS', 'NU INVEST CORRETORA DE VALORES S.A.', '2542008', 'ROXO34', '499']);

      const wsEmp = wb.addWorksheet('Posição - Empréstimos');
      wsEmp.addRow(['Produto', 'Instituição', 'Natureza', 'Quantidade', 'Preço de Fechamento']);
      wsEmp.addRow(['HYPE3 - HYPERA S.A.', 'XP INVESTIMENTOS CCTVM S/A', 'Doador', '84', '29.50']);
      wsEmp.addRow(['STBP3 - SANTOS BRASIL', 'XP INVESTIMENTOS CCTVM S/A', 'Doador', '700', '12.80']);

      const arrayBuffer = await wb.xlsx.writeBuffer();
      const annualBase64 = Buffer.from(arrayBuffer).toString('base64');

      // 1. Preview
      const previewRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/imports/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_ANNUAL_REPORT_XLSX',
          fileName: 'relatorio-consolidado-anual-2024.xlsx',
          content: annualBase64,
        })
        .expect(200);

      const previewData = previewRes.body.data;
      expect(previewData.summary.totalRows).toBe(5); // ITSA4, SAPR4, HYPE3, ROXO34, STBP3
      expect(previewData.summary.ready).toBe(5);
      expect(previewData.summary.needsReview).toBe(0);
      expect(previewData.summary.duplicates).toBe(0);

      // Verify STBP3: 700 (loaned only)
      const stbp3 = previewData.candidates.find((c: { ticker: string }) => c.ticker === 'STBP3')!;
      expect(stbp3.operation).toBe('TRANSFER_IN');
      expect(stbp3.quantity).toBe('700');
      expect(stbp3.tradeDate).toBe('2024-12-31');
      expect(stbp3.status).toBe('READY');
      expect(stbp3.notes).toContain('(Empréstimo Doador: 700)');

      // Verify HYPE3: 116 + 84 = 200
      const hype3 = previewData.candidates.find((c: { ticker: string }) => c.ticker === 'HYPE3')!;
      expect(hype3.operation).toBe('TRANSFER_IN');
      expect(hype3.quantity).toBe('200');
      expect(hype3.notes).toContain('(Custódia: 116 + Empréstimo Doador: 84)');

      // Verify ITSA4: fractional 1161.3
      const itsa4 = previewData.candidates.find((c: { ticker: string }) => c.ticker === 'ITSA4')!;
      expect(itsa4.quantity).toBe('1161.3');

      // Invariant: Zero ledger transactions before confirmation
      const countBefore = await prisma.transaction.count({ where: { portfolioId } });
      expect(countBefore).toBe(0);

      // 2. Confirm
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/imports/confirm`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_ANNUAL_REPORT_XLSX',
          fileName: 'relatorio-consolidado-anual-2024.xlsx',
          content: annualBase64,
          runId: previewData.runId,
          decisions: [],
        })
        .expect(201);

      expect(confirmRes.body.data.created).toBe(5);

      // Verify written ledger transactions
      const txs = await prisma.transaction.findMany({
        where: { portfolioId },
        orderBy: { tradeDate: 'asc' },
      });
      expect(txs).toHaveLength(5);
      for (const tx of txs) {
        expect(tx.type).toBe('TRANSFER_IN');
        expect(tx.source).toBe('B3');
        expect(tx.tradeDate.toISOString().slice(0, 10)).toBe('2024-12-31');
      }

      // 3. Re-upload preview verifies duplicate detection
      const rePreviewRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/imports/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'B3_ANNUAL_REPORT_XLSX',
          fileName: 'relatorio-consolidado-anual-2024.xlsx',
          content: annualBase64,
        })
        .expect(200);

      const reData = rePreviewRes.body.data;
      expect(reData.summary.duplicates).toBe(5);
      expect(reData.summary.ready).toBe(0);
    });
  });
});
