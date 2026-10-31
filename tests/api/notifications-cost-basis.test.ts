import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
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
 * Cost-basis fiscal reminders in the notification feed (real HTTP + test DB).
 * Covers the PART AG matrix over the derived 5V feed: grouped incomplete
 * items, KCRE11 COMPLETE suppression, review-required lifecycle (incl.
 * superseded exclusion + auto-resolve), idempotent deterministic ids, TAX
 * fail-closed wording (never a payment instruction), cross-user isolation,
 * and counter semantics. No ledger writes beyond seeded fixtures.
 */
describe('API Integration: cost-basis reminders in notification feed', () => {
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

  async function asset(ticker: string, type: 'STOCK' | 'FII' = 'STOCK') {
    const created = await assetRepo.create(
      Asset.create({ ticker, name: `${ticker} S.A.`, type, currency: 'BRL', exchange: 'BVMF' }),
    );
    return created.id as string;
  }

  async function buy(assetId: string, quantity: string, unitPrice: string, tradeDate: string) {
    await txRepo.create(
      TransactionFactory.createBuy({ portfolioId, accountId, assetId, quantity, unitPrice, currency: 'BRL', tradeDate }),
    );
  }

  async function opening(assetId: string, quantity: string) {
    await txRepo.create(
      TransactionFactory.createTransfer({ portfolioId, accountId, assetId, type: 'TRANSFER_IN', quantity, currency: 'BRL', tradeDate: '2024-12-31' }),
    );
  }

  async function evidence(assetId: string, status: 'DRAFT' | 'REVIEW_REQUIRED', overrides: Record<string, string> = {}, supersedesId?: string) {
    const base = {
      portfolioId, accountId, assetId,
      evidenceType: 'BROKERAGE_NOTE', source: 'MANUAL_CONFIRMED',
      quantityCovered: '120', unitCost: '8.50', totalCost: '1020.00',
      currency: 'BRL', acquisitionDate: '2024-12-26',
      status, sourceReference: 'XP-NOTA-2024-1234', ...overrides,
    };
    const fingerprint = computeCostEvidenceFingerprint({
      portfolioId, accountId, assetId, evidenceType: base.evidenceType,
      acquisitionDate: base.acquisitionDate, quantityCovered: base.quantityCovered,
      unitCost: base.unitCost, totalCost: base.totalCost, currency: base.currency,
      sourceReference: base.sourceReference, source: base.source,
    });
    const { record } = await evRepo.create({ ...base, fingerprint, supersedesId: supersedesId ?? null });
    return record;
  }

  async function feed(query = '') {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/notifications${query}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body as { data: Array<{ id: string; category: string; priority: string; title: string; description: string; actionHref: string; actionLabel: string; portfolioId: string | null }>; meta: { totalCount: number; actionRequiredCount: number; urgentCount: number; categories: string[] } };
  }

  function byPrefix(body: { data: Array<{ id: string }> }, prefix: string) {
    return body.data.filter((n) => n.id.startsWith(prefix));
  }

  it('emits one grouped IMPORTANT item for incomplete scopes (no per-asset spam)', async () => {
    const petr = await asset('PETR4');
    const vale = await asset('VALE3');
    await opening(petr, '100');
    await opening(vale, '50');
    await buy(petr, '10', '30.00', '2025-01-10');

    const body = await feed();
    const grouped = byPrefix(body, 'cost-basis:');
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      category: 'DATA_QUALITY',
      priority: 'IMPORTANT',
      actionLabel: 'Revisar posições',
      portfolioId,
    });
    expect(grouped[0]!.title).toContain('2 posições');
    expect(grouped[0]!.actionHref).toBe(`/portfolio?portfolioId=${portfolioId}&tab=overview`);
    // IMPORTANT does not drive the Alertas badge.
    expect(body.meta.actionRequiredCount).toBeGreaterThanOrEqual(1); // tax-blocked below
    // Tax-blocked companion exists (canonical INCOMPLETE), FISCAL/ACTION_REQUIRED.
    const blocked = byPrefix(body, 'tax-blocked:');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ category: 'FISCAL', priority: 'ACTION_REQUIRED', actionHref: '/tax' });
  });

  it('suppresses the incomplete item for KCRE11-style COMPLETE documentary coverage', async () => {
    const kcre = await asset('KCRE11', 'FII');
    await opening(kcre, '120');
    await buy(kcre, '80', '8.45', '2024-12-27');
    await buy(kcre, '100', '7.99', '2025-01-24');
    const draft = await evidence(kcre, 'DRAFT');
    const submitted = await evRepo.create({
      portfolioId, accountId, assetId: kcre, evidenceType: 'BROKERAGE_NOTE', source: 'MANUAL_CONFIRMED',
      quantityCovered: '120', unitCost: '8.50', totalCost: '1020.00', currency: 'BRL',
      acquisitionDate: '2024-12-26', status: 'REVIEW_REQUIRED', sourceReference: 'XP-NOTA-2024-1234',
      fingerprint: draft.fingerprint, supersedesId: draft.id,
    });
    await evRepo.create({
      portfolioId, accountId, assetId: kcre, evidenceType: 'BROKERAGE_NOTE', source: 'MANUAL_CONFIRMED',
      quantityCovered: '120', unitCost: '8.50', totalCost: '1020.00', currency: 'BRL',
      acquisitionDate: '2024-12-26', status: 'VERIFIED', sourceReference: 'XP-NOTA-2024-1234',
      fingerprint: submitted.record.fingerprint, supersedesId: submitted.record.id, confirmedBy: userId,
    });

    const body = await feed();
    // No "missing cost" item despite canonical INCOMPLETE — coverage is COMPLETE.
    expect(byPrefix(body, 'cost-basis:')).toHaveLength(0);
    // Superseded REVIEW_REQUIRED rows never emit review items either.
    expect(byPrefix(body, 'cost-evidence:')).toHaveLength(0);
    // Canonical tax cost is still INCOMPLETE → fail-closed FISCAL reminder stays.
    expect(byPrefix(body, 'tax-blocked:')).toHaveLength(1);
  });

  it('emits ACTION_REQUIRED review items only for current REVIEW_REQUIRED rows', async () => {
    const itub = await asset('ITUB4');
    await opening(itub, '200');
    const draft = await evidence(itub, 'DRAFT', { quantityCovered: '200', unitCost: '30.00', totalCost: '6000.00', sourceReference: 'DOC-1' });

    let body = await feed();
    // DRAFT alone emits no review item.
    expect(byPrefix(body, 'cost-evidence:')).toHaveLength(0);

    // Submit → REVIEW_REQUIRED revision.
    const submitted = await evRepo.create({
      portfolioId, accountId, assetId: itub, evidenceType: 'BROKERAGE_NOTE', source: 'MANUAL_CONFIRMED',
      quantityCovered: '200', unitCost: '30.00', totalCost: '6000.00', currency: 'BRL',
      acquisitionDate: '2024-12-26', status: 'REVIEW_REQUIRED', sourceReference: 'DOC-1',
      fingerprint: draft.fingerprint, supersedesId: draft.id,
    });
    body = await feed();
    const review = byPrefix(body, 'cost-evidence:');
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({
      category: 'DATA_QUALITY', priority: 'ACTION_REQUIRED', actionLabel: 'Revisar evidência',
    });
    expect(review[0]!.id).toBe(`cost-evidence:${submitted.record.id}:review-required`);
    expect(review[0]!.actionHref).toBe(`/portfolio/assets/${itub}?portfolioId=${portfolioId}`);

    // Verify → REVIEW_REQUIRED disappears (auto-resolved, VERIFIED needs no action).
    await evRepo.create({
      portfolioId, accountId, assetId: itub, evidenceType: 'BROKERAGE_NOTE', source: 'MANUAL_CONFIRMED',
      quantityCovered: '200', unitCost: '30.00', totalCost: '6000.00', currency: 'BRL',
      acquisitionDate: '2024-12-26', status: 'VERIFIED', sourceReference: 'DOC-1',
      fingerprint: submitted.record.fingerprint, supersedesId: submitted.record.id, confirmedBy: userId,
    });
    body = await feed();
    expect(byPrefix(body, 'cost-evidence:')).toHaveLength(0);
  });

  it('is idempotent across refreshes with stable deterministic ids', async () => {
    const petr = await asset('PETR4');
    await opening(petr, '100');
    const first = await feed();
    const second = await feed();
    expect(second.data.map((n) => n.id)).toEqual(first.data.map((n) => n.id));
    const ids = first.data.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never emits payment instructions or amounts in cost/tax-blocked wording', async () => {
    const petr = await asset('PETR4');
    await opening(petr, '100');
    const body = await feed();
    const sensitive = body.data.filter((n) => n.id.startsWith('cost-basis:') || n.id.startsWith('tax-blocked:'));
    expect(sensitive.length).toBeGreaterThan(0);
    for (const n of sensitive) {
      expect(`${n.title} ${n.description}`).not.toMatch(/pague|pagamento|boleto|pix|darf.*emit|emitir darf/i);
    }
  });

  it('emits nothing cost-related for fully KNOWN positions', async () => {
    const petr = await asset('PETR4');
    await buy(petr, '100', '30.00', '2025-01-10');
    const body = await feed();
    expect(byPrefix(body, 'cost-basis:')).toHaveLength(0);
    expect(byPrefix(body, 'cost-evidence:')).toHaveLength(0);
    expect(byPrefix(body, 'tax-blocked:')).toHaveLength(0);
  });

  it('isolates feeds cross-user (404 on foreign portfolio)', async () => {
    const petr = await asset('PETR4');
    await opening(petr, '100');
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?portfolioId=00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
