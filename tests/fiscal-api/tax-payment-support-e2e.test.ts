import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { uuidFor } from '../tax-engine/helpers';
import { TaxPaymentSupport, TaxPaymentEvidenceRecord } from '@atlas/tax-engine';

const prisma = getTestPrismaClient();

async function buildApp(today: string): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => today })
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

async function session(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Compliance User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

describe('Phase 4K.2 — DARF Payment Support & Settlement Evidence 36-Scenario E2E Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-payment-support');
  const user2 = uuidFor('user2-payment-support');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-15');
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to create an authoritative monthly obligation in prisma
  async function seedObligation(params: {
    id: string;
    userId: string;
    competence: string;
    amount: string;
    dueDate?: string | null;
    status?: 'OPEN' | 'COMPLETED' | 'SUPERSEDED' | 'DISMISSED' | 'PROVISIONAL';
    revenueCode?: string;
    fingerprint?: string;
  }) {
    await prisma.taxObligationRecord.create({
      data: {
        id: params.id,
        taxSubjectId: params.userId,
        competence: params.competence,
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: params.revenueCode ?? '6015',
        liabilityFingerprint: params.fingerprint ?? `fp-${params.id}-v1`,
        revision: 1,
        principalAmount: params.amount,
        currency: 'BRL',
        dueDate: params.dueDate === null ? null : new Date(`${params.dueDate ?? '2026-04-30'}T00:00:00.000Z`),
        status: params.status ?? 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  }

  // =========================================================================
  // SECTION 1: SUPPORT PROJECTION SCENARIOS (1 to 8)
  // =========================================================================

  it('Scenario 1 (Projection): payable monthly DARF 6015 projects valid READY payment support model', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-1');
    await seedObligation({ id: obId, userId: user1, competence: '2026-01', amount: '1250.50' });

    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const data: TaxPaymentSupport = res.body.data;
    expect(data.obligationKey).toBe(key);
    expect(data.period).toBe('2026-01');
    expect(data.supportStatus).toBe('READY');
    expect(data.reconciliationStatus).toBe('NO_EVIDENCE');
    expect(data.revenueCode).toBe('6015');
    expect(data.amount).toBe('1250.5');
    expect(data.dueDate).toBe('2026-04-30');
    expect(data.version).toBe('4K.2');
  });

  it('Scenario 2 (Projection): exact decimal amount & currency BRL preserved without float coercion', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-2');
    await seedObligation({ id: obId, userId: user1, competence: '2026-02', amount: '3500.75' });

    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.amount).toBe('3500.75');
    expect(res.body.data.currency).toBe('BRL');
  });

  it('Scenario 3 (Projection): revenue code preservation from upstream obligation metadata', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.revenueCode).toBe('6015');
  });

  it('Scenario 4 (Projection): due date & overdue check based on injected civil fiscal clock', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-4');
    // dueDate 2026-04-10 < today 2026-04-15 => isOverdue true
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-03',
      amount: '800.00',
      dueDate: '2026-04-10',
    });

    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.isOverdue).toBe(true);
    expect(res.body.data.dueDate).toBe('2026-04-10');
  });

  it('Scenario 5 (Projection): payment instructions structured array provided with 6 operational steps', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.paymentInstructions).toBeInstanceOf(Array);
    expect(res.body.data.paymentInstructions.length).toBe(6);
    expect(res.body.data.paymentInstructions[1]).toContain('6015');
  });

  it('Scenario 6 (Projection): zero tax obligation returns safe NOT_APPLICABLE status model', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-6');
    await seedObligation({ id: obId, userId: user1, competence: '2026-04', amount: '0.00' });

    const key = `${user1}:2026-04:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.supportStatus).toBe('NOT_APPLICABLE');
  });

  it('Scenario 7 (Projection): non-existent obligation returns 404 anti-enumeration', async () => {
    const token = await session(user1);
    const fakeKey = `${user1}:2026-09:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(fakeKey)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('Scenario 8 (Projection): annual obligation returns safe NOT_APPLICABLE model', async () => {
    const token = await session(user1);
    const annualKey = `${user1}:2026:ANNUAL_FILING_SUPPORT:annual-unified-filing`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(annualKey)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.supportStatus).toBe('NOT_APPLICABLE');
  });

  // =========================================================================
  // SECTION 2: PAYMENT EVIDENCE RECORDING (9 to 16)
  // =========================================================================

  it('Scenario 9 (Evidence): records valid payment evidence with user-reported metadata', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-20',
        amountReported: '1250.50',
        revenueCodeReported: '6015',
        referencePeriod: '2026-01',
        externalReference: 'AUTH-BANCARIA-987',
        note: 'Pago via Internet Banking',
      })
      .expect(201);

    const data: TaxPaymentEvidenceRecord = res.body.data;
    expect(data.obligationKey).toBe(key);
    expect(data.revision).toBe(1);
    expect(data.paymentDate).toBe('2026-04-20');
    expect(data.amountReported).toBe('1250.5');
    expect(data.externalReference).toBe('AUTH-BANCARIA-987');
    expect(data.verificationStatus).toBe('USER_REPORTED');
  });

  it('Scenario 10 (Evidence): monotonic revision increment on successive submissions (rev 1 -> rev 2)', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-21',
        amountReported: '1250.50',
        referencePeriod: '2026-01',
        note: 'Correção de comprovante',
      })
      .expect(201);

    expect(res.body.data.revision).toBe(2);
  });

  it('Scenario 11 (Evidence): verification status is strictly USER_REPORTED (never government verified)', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list: TaxPaymentEvidenceRecord[] = res.body.data;
    expect(list.length).toBeGreaterThanOrEqual(2);
    list.forEach((item) => {
      expect(item.verificationStatus).toBe('USER_REPORTED');
    });
  });

  it('Scenario 12 (Evidence): anti-enumeration 404 when submitting evidence for foreign obligation key', async () => {
    const token = await session(user2);
    // user2 tries to access user1's obligation
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-20',
        amountReported: '100.00',
        referencePeriod: '2026-01',
      })
      .expect(404);
  });

  it('Scenario 13 (Evidence): rejects invalid amount string (negative or non-decimal)', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-20',
        amountReported: '-50.00',
        referencePeriod: '2026-01',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-20',
        amountReported: 'invalid-amount',
        referencePeriod: '2026-01',
      })
      .expect(400);
  });

  it('Scenario 14 (Evidence): rejects invalid paymentDate format', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '20-04-2026',
        amountReported: '1250.50',
        referencePeriod: '2026-01',
      })
      .expect(400);
  });

  it('Scenario 15 (Evidence): preserves external reference and notes in append-only history', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-20',
        amountReported: '3500.75',
        revenueCodeReported: '6015',
        referencePeriod: '2026-02',
        externalReference: 'PIX-E2E-123',
        note: 'Comprovante teste nota',
      })
      .expect(201);

    expect(res.body.data.externalReference).toBe('PIX-E2E-123');
    expect(res.body.data.note).toBe('Comprovante teste nota');
  });

  it('Scenario 16 (Evidence): captures authoritative source fingerprint at time of evidence record', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const latest = res.body.data[0];
    expect(latest.sourceFingerprint).toBeDefined();
    expect(latest.sourceFingerprint.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // SECTION 3: RECONCILIATION LOGIC (17 to 24)
  // =========================================================================

  it('Scenario 17 (Reconciliation): obligation with no evidence yields NO_EVIDENCE and READY', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-17');
    await seedObligation({ id: obId, userId: user1, competence: '2026-05', amount: '200.00' });

    const key = `${user1}:2026-05:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.reconciliationStatus).toBe('NO_EVIDENCE');
    expect(res.body.data.supportStatus).toBe('READY');
    expect(res.body.data.latestEvidence).toBeNull();
  });

  it('Scenario 18 (Reconciliation): exact match in amount, period, and code yields USER_REPORTED_MATCH', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-02:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // In Scenario 15 we recorded exactly 3500.75 for 2026-02
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(res.body.data.supportStatus).toBe('READY');
    expect(res.body.data.latestEvidence.isStale).toBe(false);
  });

  it('Scenario 19 (Reconciliation): amount mismatch yields USER_REPORTED_MISMATCH and REQUIRES_REVIEW', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-19');
    await seedObligation({ id: obId, userId: user1, competence: '2026-06', amount: '500.00' });

    const key = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-07-20',
        amountReported: '450.00', // differs from 500.00
        referencePeriod: '2026-06',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(res.body.data.supportStatus).toBe('REQUIRES_REVIEW');
  });

  it('Scenario 20 (Reconciliation): period mismatch yields USER_REPORTED_MISMATCH', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-20');
    await seedObligation({ id: obId, userId: user1, competence: '2026-07', amount: '600.00' });

    const key = `${user1}:2026-07:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-08-20',
        amountReported: '600.00',
        referencePeriod: '2026-06', // wrong period
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
  });

  it('Scenario 21 (Reconciliation): source changed / divergent fingerprint yields STALE_SOURCE and STALE', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-21');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-08',
      amount: '700.00',
      fingerprint: 'fp-old',
    });

    const key = `${user1}:2026-08:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-09-20',
        amountReported: '700.00',
        referencePeriod: '2026-08',
      })
      .expect(201);

    // Now simulate recalculation in tax obligation (new liability fingerprint)
    await prisma.taxObligationRecord.update({
      where: { id: obId },
      data: { liabilityFingerprint: 'fp-new-after-trade-edit' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.reconciliationStatus).toBe('STALE_SOURCE');
    expect(res.body.data.supportStatus).toBe('STALE');
    expect(res.body.data.latestEvidence.isStale).toBe(true);
  });

  it('Scenario 22 (Reconciliation): superseded obligation produces STALE support status', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-22');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-09',
      amount: '900.00',
      fingerprint: 'fp-ob-current',
    });

    const key = `${user1}:2026-09:MONTHLY_TAX_PAYMENT:monthly-6015`;
    // Record user completion with old fingerprint
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REPORTED_COMPLETION',
        sourceFingerprint: 'fp-ob-previous',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.supportStatus).toBe('STALE');
  });

  it('Scenario 23 (Reconciliation): multiple revisions strictly reconciles against highest revision', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // Rev 1 in Scenario 19 was 450.00 (mismatch). Now submit Rev 2 with 500.00 (match)
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-07-21',
        amountReported: '500.00', // matches obligation amount 500.00!
        referencePeriod: '2026-06',
        note: 'Correção do valor',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.latestEvidence.revision).toBe(2);
    expect(res.body.data.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(res.body.data.supportStatus).toBe('READY');
  });

  it('Scenario 24 (Reconciliation): overdue obligation retains overdue flag while projecting support', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.isOverdue).toBe(true);
    expect(res.body.data.supportStatus).toBe('READY');
  });

  // =========================================================================
  // SECTION 4: EXPORT & SECURITY (25 to 32)
  // =========================================================================

  it('Scenario 25 (Export): export JSON with exact fields, Content-Disposition, and no-store', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support/export?format=json`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('atlas-darf-apoio-');
    expect(res.headers['cache-control']).toContain('no-store');
    const parsed = JSON.parse(res.text);
    expect(parsed.obligationKey).toBe(key);
    expect(parsed.amount).toBe('1250.5');
  });

  it('Scenario 26 (Export): export CSV with semicolon, CRLF, Content-Disposition, and disclaimer banner', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.text).toContain('PROJECT ATLAS - GUIA DE APOIO OPERACIONAL AO PAGAMENTO DE DARF');
    expect(res.text).toContain('SECAO A - DADOS DA OBRIGACAO');
    expect(res.text).toContain('SECAO B - INSTRUCOES OPERACIONAIS');
    expect(res.text).toContain(';\r\n');
  });

  it('Scenario 27 (Security): OWASP formula injection protection in CSV cells', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-27');
    await seedObligation({ id: obId, userId: user1, competence: '2026-10', amount: '100.00' });

    const key = `${user1}:2026-10:MONTHLY_TAX_PAYMENT:monthly-6015`;
    // Record evidence with potential formula injection in note
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-11-20',
        amountReported: '100.00',
        referencePeriod: '2026-10',
        externalReference: '=cmd|"/C calc"!A0',
        note: '+SUM(1,2)',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // OWASP prepends single quote (') to cells starting with =, +, -, @
    expect(res.text).toContain("'=cmd");
    expect(res.text).toContain("'+SUM(1,2)");
  });

  it('Scenario 28 (Security): export anti-enumeration 404 on foreign obligation', async () => {
    const token = await session(user2);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('Scenario 29 (Security): export 400 on invalid format query parameter', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support/export?format=pdf`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 30 (Security): unauthenticated requests return 401', async () => {
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .send({ paymentDate: '2026-04-20', amountReported: '100.00', referencePeriod: '2026-01' })
      .expect(401);
  });

  it('Scenario 31 (Security): no server error or stack trace leakage on malformed keys', async () => {
    const token = await session(user1);
    const malformed = 'not-a-valid-obligation-key';

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(malformed)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body.stack).toBeUndefined();
    expect(res.body.trace).toBeUndefined();
  });

  it('Scenario 32 (History): evidence history returns descending revision order', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list: TaxPaymentEvidenceRecord[] = res.body.data;
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < list.length - 1; i++) {
      expect(list[i].revision).toBeGreaterThan(list[i + 1].revision);
    }
  });

  // =========================================================================
  // SECTION 5: UX & WORKFLOWS (33 to 36)
  // =========================================================================

  it('Scenario 33 (Workflow): full happy flow: retrieve support -> record matching payment -> verify match', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-33');
    await seedObligation({ id: obId, userId: user1, competence: '2026-11', amount: '1500.00' });
    const key = `${user1}:2026-11:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // 1. Initial support check
    const step1 = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(step1.body.data.reconciliationStatus).toBe('NO_EVIDENCE');

    // 2. Record matching payment
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-12-20',
        amountReported: '1500.00',
        referencePeriod: '2026-11',
        revenueCodeReported: '6015',
      })
      .expect(201);

    // 3. Subsequent support check shows match
    const step3 = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(step3.body.data.reconciliationStatus).toBe('USER_REPORTED_MATCH');
  });

  it('Scenario 34 (Workflow): divergent payment flow: record wrong amount -> verify mismatch warning', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-34');
    await seedObligation({ id: obId, userId: user1, competence: '2026-12', amount: '2000.00' });
    const key = `${user1}:2026-12:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // Record wrong amount
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2027-01-20',
        amountReported: '1900.00',
        referencePeriod: '2026-12',
      })
      .expect(201);

    const check = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(check.body.data.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(check.body.data.supportStatus).toBe('REQUIRES_REVIEW');
  });

  it('Scenario 35 (Workflow): source mutation flow: obligation recomputed -> verify stale status', async () => {
    const token = await session(user1);
    const obId = uuidFor('ob-scen-35');
    await seedObligation({
      id: obId,
      userId: user1,
      competence: '2026-10',
      amount: '100.00',
      fingerprint: 'fp-before-recalc',
    });
    const key = `${user1}:2026-10:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // Record matching payment against fp-before-recalc
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-11-20',
        amountReported: '100.00',
        referencePeriod: '2026-10',
      })
      .expect(201);

    // Simulate upstream ledger edit recalculating liability fingerprint
    await prisma.taxObligationRecord.update({
      where: { id: obId },
      data: { liabilityFingerprint: 'fp-after-trade-mutation' },
    });

    const check = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(check.body.data.reconciliationStatus).toBe('STALE_SOURCE');
    expect(check.body.data.supportStatus).toBe('STALE');
  });

  it('Scenario 36 (Workflow): multi-evidence succession: record rev 1 -> record rev 2 -> verify reconciliation with rev 2', async () => {
    const token = await session(user1);
    const key = `${user1}:2026-12:MONTHLY_TAX_PAYMENT:monthly-6015`;

    // In Scenario 34, Rev 1 was 1900.00 (mismatch).
    // Now user pays difference and submits Rev 2 with correct amount 2000.00
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2027-01-25',
        amountReported: '2000.00',
        referencePeriod: '2026-12',
        note: 'Complementação de pagamento',
      })
      .expect(201);

    const check = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(check.body.data.latestEvidence.revision).toBe(2);
    expect(check.body.data.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(check.body.data.supportStatus).toBe('READY');
  });

  it('H9-01: provisional obligation without due date never fabricates one (no today fallback)', async () => {
    // Owner H9 state: PROVISIONAL R$15 with null dueDate surfaced "15/10/2026".
    const user = uuidFor('user-h9-provisional');
    const token = await session(user);
    await seedObligation({
      id: uuidFor('ob-h9-prov'),
      userId: user,
      competence: '2026-10',
      amount: '15',
      dueDate: null,
      status: 'PROVISIONAL',
    });

    const key = `${user}:2026-10:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-support`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.supportStatus).toBe('NOT_APPLICABLE');
    expect(res.body.data.amount).toBe('15');
    // No fabricated due date: empty, never today or any derived date.
    expect(res.body.data.dueDate).toBe('');
    const instructions: string = res.body.data.paymentInstructions.join(' ');
    expect(instructions).toContain('ainda não está pagável');
    expect(instructions).not.toContain('zerado ou isento');
  });

  it('H9-01: evidence recording is rejected for non-payable obligations (server guard)', async () => {
    const user = uuidFor('user-h9-evidence-guard');
    const token = await session(user);
    await seedObligation({
      id: uuidFor('ob-h9-guard'),
      userId: user,
      competence: '2026-10',
      amount: '15',
      dueDate: null,
      status: 'PROVISIONAL',
    });

    const key = `${user}:2026-10:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-10-15',
        amountReported: '15',
        revenueCodeReported: '6015',
        referencePeriod: '2026-10',
      })
      .expect(422);

    expect(res.body.code).toBe('TAX_PAYMENT.OBLIGATION_NOT_PAYABLE');

    // No history mutation occurred.
    const history = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.data).toHaveLength(0);
  });

  it('H9-01: evidence recording still works for payable obligations (no global disable)', async () => {
    const user = uuidFor('user-h9-evidence-ok');
    const token = await session(user);
    await seedObligation({
      id: uuidFor('ob-h9-ok'),
      userId: user,
      competence: '2026-01',
      amount: '1250.50',
      status: 'OPEN',
    });

    const key = `${user}:2026-01:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-02-10',
        amountReported: '1250.50',
        revenueCodeReported: '6015',
        referencePeriod: '2026-01',
      })
      .expect(201);

    expect(res.body.data.verificationStatus).toBe('USER_REPORTED');
  });
});
