import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TransactionFactory, computeCostEvidenceFingerprint, Asset } from '@atlas/domain';
import { TransactionRepository, AssetRepository, CostBasisEvidenceRepository } from '@atlas/database';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * CTI-1 HTTP integration (real app + test DB, read-only).
 * Shape, anti-enumeration, competence validation, KCRE11 nuance, liability
 * invariance (PART AA), zero-provider-call gate (PART Y), no-persistence.
 */
describe('API Integration: deterministic tax intelligence (CTI-1)', () => {
  let app: INestApplication;
  let userId: string;
  let portfolioId: string;
  let accountId: string;
  let token: string;
  const prisma = getTestPrismaClient();
  const txRepo = new TransactionRepository(prisma);
  const assetRepo = new AssetRepository(prisma);
  const evRepo = new CostBasisEvidenceRepository(prisma);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    token = (await createAuthenticatedUserSession(userId)).token;
  });

  async function asset(ticker: string) {
    const created = await assetRepo.create(
      Asset.create({ ticker, name: `${ticker} S.A.`, type: 'FII', currency: 'BRL', exchange: 'BVMF' }),
    );
    return created.id as string;
  }

  async function cti(query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/tax-intelligence${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('rejects foreign portfolios with 404 (anti-enumeration)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/portfolios/00000000-0000-4000-8000-000000000000/tax-intelligence')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects invalid competence with 400', async () => {
    for (const bad of ['?competence=2026-13', '?competence=tomorrow', '?competence=2026']) {
      const res = await cti(bad);
      expect(res.status).toBe(400);
    }
  });

  it('mirrors canonical BLOCKED/PARTIAL without amounts on unknown-cost ledger', async () => {
    const kcre = await asset('KCRE11');
    await txRepo.create(
      TransactionFactory.createTransfer({ portfolioId, accountId, assetId: kcre, type: 'TRANSFER_IN', quantity: '120', currency: 'BRL', tradeDate: '2024-12-31' }),
    );
    const res = await cti('?competence=2025-01');
    expect(res.status).toBe(200);
    const body = res.body.data;
    expect(['BLOCKED', 'PARTIAL', 'UNKNOWN']).toContain(body.status);
    expect(body.status).not.toBe('CONFIRMED');
    expect(body.facts.find((f: { code: string }) => f.code === 'TAX_DUE')).toBeUndefined();
    expect(body.headline).toBeTruthy();
    expect(body.limitations.length).toBeGreaterThan(0);
    for (const action of body.actions) {
      expect([
        'OPEN_TAX', 'OPEN_TAX_QUALITY', 'REVIEW_COST_BASIS', 'REVIEW_POSITIONS',
        'REVIEW_IMPORTS', 'OPEN_DATA_QUALITY', 'OPEN_REVIEWS', 'OPEN_PORTFOLIO',
        'OPEN_ANNUAL_READINESS', 'OPEN_OBLIGATION',
      ]).toContain(action.actionId);
    }
    expect(typeof body.generatedAt).toBe('string');
  });

  it('preserves the KCRE11 documentary-complete nuance end to end', async () => {
    const kcre = await asset('KCRE11');
    await txRepo.create(
      TransactionFactory.createTransfer({ portfolioId, accountId, assetId: kcre, type: 'TRANSFER_IN', quantity: '120', currency: 'BRL', tradeDate: '2024-12-31' }),
    );
    await txRepo.create(
      TransactionFactory.createBuy({ portfolioId, accountId, assetId: kcre, quantity: '80', unitPrice: '8.45', currency: 'BRL', tradeDate: '2024-12-27' }),
    );
    const fp = computeCostEvidenceFingerprint({
      portfolioId, accountId, assetId: kcre, evidenceType: 'BROKERAGE_NOTE',
      acquisitionDate: '2024-12-26', quantityCovered: '120', unitCost: '8.50',
      totalCost: '1020.00', currency: 'BRL', sourceReference: 'XP-1', source: 'MANUAL_CONFIRMED',
    });
    const base = {
      portfolioId, accountId, assetId: kcre, evidenceType: 'BROKERAGE_NOTE', source: 'MANUAL_CONFIRMED',
      quantityCovered: '120', unitCost: '8.50', totalCost: '1020.00', currency: 'BRL',
      acquisitionDate: '2024-12-26', sourceReference: 'XP-1',
    };
    const v1 = await evRepo.create({ ...base, fingerprint: fp, status: 'DRAFT' });
    const v2 = await evRepo.create({ ...base, fingerprint: v1.record.fingerprint, status: 'REVIEW_REQUIRED', supersedesId: v1.record.id });
    await evRepo.create({ ...base, fingerprint: v2.record.fingerprint, status: 'VERIFIED', supersedesId: v2.record.id, confirmedBy: userId });

    const res = await cti('?competence=2025-01');
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body.data);
    expect(text).toContain('DOCUMENTARY_VS_TAX_COST');
    expect(text).not.toMatch(/KCRE11 ainda está sem custo comprovado/i);
  });

  it('leaves canonical liability output byte-identical (PART AA)', async () => {
    const kcre = await asset('KCRE11');
    await txRepo.create(
      TransactionFactory.createBuy({ portfolioId, accountId, assetId: kcre, quantity: '10', unitPrice: '8.45', currency: 'BRL', tradeDate: '2025-01-05' }),
    );
    const before = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/2025-01/liability`)
      .set('Authorization', `Bearer ${token}`);
    await cti('?competence=2025-01');
    await cti('?competence=2025-01');
    const after = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/2025-01/liability`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(before.status);
    expect(after.body).toEqual(before.body);
  });

  it('performs zero AI provider calls (static gate, PART Y)', () => {
    const roots = [
      'packages/tax-intelligence/src',
      'apps/api/src/application/tax-intelligence',
      'apps/api/src/modules/portfolios/portfolio-tax-intelligence.controller.ts',
      'apps/api/src/modules/portfolios/dto/tax-intelligence.dto.ts',
    ];
    for (const root of roots) {
      const full = path.join(process.cwd(), root);
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (entry.name.endsWith('.ts')) files.push(p);
        }
      };
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.push(full);
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content, `${file} must not touch ai-engine`).not.toMatch(/ai-engine|AI_PROVIDER|FakeAiProvider|complete\(messages/);
      }
    }
  });

  it('persists nothing on repeated reads', async () => {
    const kcre = await asset('KCRE11');
    await txRepo.create(
      TransactionFactory.createBuy({ portfolioId, accountId, assetId: kcre, quantity: '10', unitPrice: '8.45', currency: 'BRL', tradeDate: '2025-01-05' }),
    );
    const txBefore = await prisma.transaction.count();
    await cti('?competence=2025-01');
    await cti('?competence=2025-01');
    expect(await prisma.transaction.count()).toBe(txBefore);
    expect(await prisma.costBasisEvidenceRecord.count()).toBe(0);
  });
});
