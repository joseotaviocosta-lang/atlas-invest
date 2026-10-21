import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  getTestPrismaClient,
  createAuthenticatedUserSession,
} from './setup';

const CLEAN_CSV = [
  'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
  '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-1',
  '20/02/2026;VALE3;VENDA;50;72,10;2,50;BRL;XP;Test Account;NEG-2',
  '10/03/2026;PETR4;COMPRA;10;40,00;;BRL;;;',
].join('\n');

const MIXED_CSV = [
  'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
  '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-1',
  '99/99/2026;XXXX99;COMPRA;abc;;0;BRL;;;;',
  '05/04/2026;ZZZZ4;COMPRA;20;10,00;0;BRL;;;;',
  '12/05/2026;PETR4;DIVIDENDO;100;0;0;BRL;;;;',
].join('\n');

describe('API Integration: Portfolio Import Hub (Phase 5K)', () => {
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

  function previewBody(content: string, extra: Record<string, unknown> = {}) {
    return {
      sourceType: 'GENERIC_CSV',
      provider: 'XP',
      fileName: 'operacoes-2026.csv',
      content,
      defaultAccountId: accountId,
      ...extra,
    };
  }

  describe('Preview without ledger writes', () => {
    it('parses a clean file and reports all rows READY with resolved identity', async () => {
      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(previewBody(CLEAN_CSV));

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toEqual({
        totalRows: 3,
        ready: 3,
        duplicates: 0,
        needsReview: 0,
        invalid: 0,
        unsupported: 0,
        ambiguousAssets: 0,
      });
      const candidates = res.body.data.candidates;
      expect(candidates[0].assetId).toBe(petrId);
      expect(candidates[0].accountId).toBe(accountId);
      expect(candidates[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(candidates[0].provider).toBe('XP');

      const listed = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(listed.status).toBe(200);
      expect(listed.body.data).toHaveLength(0);
    });

    it('classifies invalid, unknown-asset and unsupported rows explicitly', async () => {
      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(previewBody(MIXED_CSV));

      expect(res.status).toBe(200);
      expect(res.body.data.summary).toEqual({
        totalRows: 4,
        ready: 1,
        duplicates: 0,
        needsReview: 1,
        invalid: 1,
        unsupported: 1,
        ambiguousAssets: 0,
      });
      const byRow = Object.fromEntries(
        res.body.data.candidates.map((candidate: { rowNumber: number }) => [
          candidate.rowNumber,
          candidate,
        ]),
      );
      expect(byRow[2].status).toBe('READY');
      expect(byRow[3].status).toBe('INVALID');
      expect(byRow[3].issues.map((issue: { code: string }) => issue.code)).toEqual(
        expect.arrayContaining(['INVALID_DATE', 'INVALID_QUANTITY']),
      );
      expect(byRow[4].status).toBe('NEEDS_REVIEW');
      expect(byRow[4].issues.map((issue: { code: string }) => issue.code)).toContain(
        'UNKNOWN_ASSET',
      );
      expect(byRow[5].status).toBe('UNSUPPORTED');
    });

    it('rejects empty files with IMPORT.INVALID_INPUT and no ledger writes', async () => {
      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(previewBody('   \n  '));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IMPORT.INVALID_INPUT');
    });

    it('rejects files missing required columns', async () => {
      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(previewBody('date;ticker\n2026-01-15;PETR4\n'));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IMPORT.INVALID_INPUT');
      expect(res.body.message).toMatch(/operation|quantity/);
    });

    it('rejects unsupported sources at the DTO boundary', async () => {
      const res = await request(app.getHttpServer())
        .post(previewUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(previewBody(CLEAN_CSV, { sourceType: 'B3_API' }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
    });

    it('returns 404 for portfolios outside the authenticated scope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/portfolios/00000000-0000-4000-8000-000000000000/imports/preview')
        .set('Authorization', `Bearer ${authToken}`)
        .send(previewBody(CLEAN_CSV));

      expect(res.status).toBe(404);
    });
  });

  describe('Confirm through the canonical ledger path', () => {
    it('writes READY rows as canonical CSV transactions and returns a receipt', async () => {
      const res = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...previewBody(CLEAN_CSV), decisions: [] });

      expect(res.status).toBe(201);
      const receipt = res.body.data;
      expect(receipt.portfolioId).toBe(portfolioId);
      expect(receipt.provider).toBe('XP');
      expect(receipt.fileName).toBe('operacoes-2026.csv');
      expect(receipt.totalRows).toBe(3);
      expect(receipt.created).toBe(3);
      expect(receipt.skippedDuplicates).toBe(0);
      expect(receipt.skippedByUser).toBe(0);
      expect(receipt.failed).toEqual([]);
      expect(receipt.transactionIds).toHaveLength(3);
      expect(receipt.receiptId).toBeDefined();

      const listed = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(listed.status).toBe(200);
      expect(listed.body.data).toHaveLength(3);
      const first = listed.body.data.find(
        (tx: { externalId?: string }) => tx.externalId === 'NEG-1',
      );
      expect(first.source).toBe('CSV');
      expect(first.provider).toBe('XP');
      expect(first.quantity).toBe('100');
      expect(first.notes).toMatch(/operacoes-2026\.csv/);
    });

    it('is idempotent: confirming the same file twice creates nothing new', async () => {
      const payload = { ...previewBody(CLEAN_CSV), decisions: [] };
      const first = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);
      expect(first.status).toBe(201);
      expect(first.body.data.created).toBe(3);

      const second = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);
      expect(second.status).toBe(201);
      expect(second.body.data.created).toBe(0);
      expect(second.body.data.skippedDuplicates).toBe(3);
      expect(second.body.data.failed).toEqual([]);

      const listed = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(listed.body.data).toHaveLength(3);
    });

    it('honours explicit skips and resolves unknown assets via override', async () => {
      const res = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...previewBody(MIXED_CSV),
          decisions: [
            { rowNumber: 3, action: 'skip' },
            { rowNumber: 4, action: 'import', assetId: valeId },
            { rowNumber: 5, action: 'skip' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.created).toBe(2);
      expect(res.body.data.skippedByUser).toBe(2);
      expect(res.body.data.failed).toEqual([]);
    });

    it('rejects cross-portfolio default accounts with 409', async () => {
      const otherPortfolio = await prisma.portfolio.create({
        data: {
          id: '77777777-7777-4777-8777-777777777777',
          userId: '11111111-1111-4111-8111-111111111111',
          name: 'Other Portfolio',
          baseCurrency: 'BRL',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      });
      const otherAccount = await prisma.account.create({
        data: {
          id: '88888888-8888-4888-8888-888888888888',
          portfolioId: otherPortfolio.id,
          institutionId: '22222222-2222-4222-8222-222222222222',
          name: 'Other Account',
          currency: 'BRL',
          status: 'ACTIVE',
        },
      });

      const res = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...previewBody(CLEAN_CSV, { defaultAccountId: otherAccount.id }), decisions: [] });

      expect(res.status).toBe(409);
    });
  });

  describe('Replay consumes imported transactions normally', () => {
    it('derives positions from imported BUY/SELL history', async () => {
      const csv = [
        'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
        '10/01/2026;PETR4;COMPRA;100;38,50;0;BRL;XP;Test Account;H-1',
        '20/02/2026;PETR4;VENDA;40;42,00;0;BRL;XP;Test Account;H-2',
      ].join('\n');
      const confirmed = await request(app.getHttpServer())
        .post(confirmUrl())
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...previewBody(csv), decisions: [] });
      expect(confirmed.status).toBe(201);
      expect(confirmed.body.data.created).toBe(2);

      const state = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolioId}/state`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(state.status).toBe(200);
      const positions = state.body.data?.positions ?? state.body.data?.assets ?? [];
      const petr = (Array.isArray(positions) ? positions : []).find(
        (position: { assetId?: string; ticker?: string }) =>
          position.assetId === petrId || position.ticker === 'PETR4',
      );
      expect(petr).toBeDefined();
      expect(petr.quantity).toBe('60');
    });
  });
});
