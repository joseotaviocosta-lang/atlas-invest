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

const WITH_IDS_CSV = [
  'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
  '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;PAR-1',
  '20/02/2026;VALE3;COMPRA;50;72,10;0;BRL;XP;Test Account;PAR-2',
  '10/03/2026;PETR4;VENDA;20;40,00;0;BRL;XP;Test Account;PAR-3',
].join('\n');

const NO_IDS_CSV = [
  'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
  '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;',
  '20/02/2026;VALE3;COMPRA;50;72,10;0;BRL;XP;Test Account;',
  '10/03/2026;PETR4;VENDA;20;40,00;0;BRL;XP;Test Account;',
].join('\n');

describe('API Integration: Portfolio Import Concurrent Confirm (Phase 5K-R1)', () => {
  let app: INestApplication;
  let portfolioId: string;
  let accountId: string;
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

    await prisma.asset.create({
      data: {
        id: '55555555-5555-4555-8555-555555555555',
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
    await prisma.asset.create({
      data: {
        id: '66666666-6666-4666-8666-666666666666',
        ticker: 'VALE3',
        name: 'Vale S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
  });

  function confirmBody(content: string) {
    return {
      sourceType: 'GENERIC_CSV',
      provider: 'XP',
      fileName: 'concorrente.csv',
      content,
      defaultAccountId: accountId,
      decisions: [],
    };
  }

  function confirmRequest(content: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(confirmBody(content));
  }

  async function ledgerCount(): Promise<number> {
    return prisma.transaction.count({ where: { portfolioId } });
  }

  describe('Case A — simultaneous confirms with the same external IDs', () => {
    it('creates each canonical transaction exactly once', async () => {
      const attempts = await Promise.all([
        confirmRequest(WITH_IDS_CSV),
        confirmRequest(WITH_IDS_CSV),
        confirmRequest(WITH_IDS_CSV),
        confirmRequest(WITH_IDS_CSV),
        confirmRequest(WITH_IDS_CSV),
        confirmRequest(WITH_IDS_CSV),
      ]);

      for (const res of attempts) {
        expect(res.status).toBe(201);
      }
      const createdTotal = attempts.reduce((sum, res) => sum + res.body.data.created, 0);
      expect(createdTotal).toBe(3);
      expect(await ledgerCount()).toBe(3);
    });
  });

  describe('Case B — simultaneous confirms without external IDs', () => {
    it('creates each canonical transaction exactly once via fingerprint dedupe', async () => {
      const attempts = await Promise.all([
        confirmRequest(NO_IDS_CSV),
        confirmRequest(NO_IDS_CSV),
        confirmRequest(NO_IDS_CSV),
        confirmRequest(NO_IDS_CSV),
        confirmRequest(NO_IDS_CSV),
        confirmRequest(NO_IDS_CSV),
      ]);

      for (const res of attempts) {
        expect(res.status).toBe(201);
      }
      const createdTotal = attempts.reduce((sum, res) => sum + res.body.data.created, 0);
      expect(createdTotal).toBe(3);
      expect(await ledgerCount()).toBe(3);
    });
  });

  describe('Case C — parallel double submit of the same payload', () => {
    it('returns deterministic receipts with no duplicate ledger writes', async () => {
      const [first, second] = await Promise.all([
        confirmRequest(WITH_IDS_CSV),
        confirmRequest(WITH_IDS_CSV),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const createdTotal = first.body.data.created + second.body.data.created;
      const skippedTotal = first.body.data.skippedDuplicates + second.body.data.skippedDuplicates;
      expect(createdTotal).toBe(3);
      expect(skippedTotal).toBe(3);
      expect(first.body.data.failed).toEqual([]);
      expect(second.body.data.failed).toEqual([]);
      expect(await ledgerCount()).toBe(3);
    });
  });
});
