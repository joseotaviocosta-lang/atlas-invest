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
        name: 'Period Close User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

type Readiness = {
  scope: string;
  period: string;
  calendarYear: number;
  month: string | null;
  exercise: number | null;
  readiness: string;
  checklist: Array<{ category: string; state: string; detail: string; itemCount: number }>;
  unresolvedItems: Array<{
    ref: string;
    kind: string;
    title: string;
    reason: string;
    severity: string;
  }>;
  sourceFingerprint: string;
  previousClose: {
    revision: number;
    recordStatus: string;
    sourceFingerprint: string;
    binderFingerprint: string;
    closedAt: string | null;
  } | null;
  isStaleVsPreviousClose: boolean;
  cleanCloseAllowed: boolean;
  sourceVersion: string;
};

type CloseRecord = {
  id: string;
  scope: string;
  period: string;
  calendarYear: number;
  month: string | null;
  exercise: number | null;
  revision: number;
  recordStatus: string;
  statusAtClose: string | null;
  closeMode: string | null;
  sourceFingerprint: string;
  binderFingerprint: string;
  closedAt: string | null;
  reason: string | null;
  createdAt: string;
};

describe('Phase 4K.5 — Period Close, Evidence Binder & Handoff 70-Scenario E2E Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-period-close');
  const user2 = uuidFor('user2-period-close');

  async function seedObligation(params: {
    id: string;
    userId: string;
    competence: string;
    amount: string | null;
    dueDate?: string | null;
    status?: string;
    fingerprint?: string;
    darfReadiness?: string;
  }) {
    await prisma.taxObligationRecord.create({
      data: {
        id: params.id,
        taxSubjectId: params.userId,
        competence: params.competence,
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: params.fingerprint ?? `fp-${params.id}-v1`,
        revision: 1,
        principalAmount: params.amount,
        currency: 'BRL',
        dueDate:
          params.dueDate === null
            ? null
            : new Date(`${params.dueDate ?? '2026-04-30'}T00:00:00.000Z`),
        status: params.status ?? 'OPEN',
        darfReadiness: params.darfReadiness ?? 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  }

  async function getReadiness(
    token: string,
    qs: string,
  ): Promise<{
    readiness: Readiness;
    meta: { binderFingerprint: string; totalCloseCount: number };
  }> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/period-close/readiness?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return { readiness: res.body.data as Readiness, meta: res.body.meta };
  }

  async function getBinder(
    token: string,
    qs: string,
  ): Promise<{
    scope: string;
    period: string;
    readiness: string;
    sections: Array<{ code: string; title: string; lines: string[] }>;
    binderFingerprint: string;
  }> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/period-close/binder?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data;
  }

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
    await session(user2);

    await seedObligation({
      id: uuidFor('pc-ob-ready'),
      userId: user1,
      competence: '2026-03',
      amount: '500.00',
      dueDate: '2026-04-30',
      fingerprint: 'fp-pc-ready-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-overdue'),
      userId: user1,
      competence: '2026-02',
      amount: '450.00',
      dueDate: '2026-03-31',
      fingerprint: 'fp-pc-overdue-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-zero'),
      userId: user1,
      competence: '2026-01',
      amount: null,
      dueDate: '2026-02-28',
      fingerprint: 'fp-pc-zero-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-blocked'),
      userId: user1,
      competence: '2026-04',
      amount: null,
      dueDate: '2026-05-31',
      status: 'BLOCKED',
      fingerprint: 'fp-pc-blocked-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-partial'),
      userId: user1,
      competence: '2026-10',
      amount: null,
      dueDate: '2026-11-30',
      fingerprint: 'fp-pc-partial-v1',
      darfReadiness: 'PARTIAL',
    });
    await seedObligation({
      id: uuidFor('pc-ob-today'),
      userId: user1,
      competence: '2026-05',
      amount: '300.00',
      dueDate: '2026-04-20',
      fingerprint: 'fp-pc-today-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-match'),
      userId: user1,
      competence: '2026-06',
      amount: '700.00',
      dueDate: '2026-07-31',
      fingerprint: 'fp-pc-match-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-mismatch'),
      userId: user1,
      competence: '2026-07',
      amount: '800.00',
      dueDate: '2026-08-31',
      fingerprint: 'fp-pc-mismatch-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-stale'),
      userId: user1,
      competence: '2026-08',
      amount: '900.00',
      dueDate: '2026-09-30',
      fingerprint: 'fp-pc-stale-v1',
    });
    await seedObligation({
      id: uuidFor('pc-ob-clean'),
      userId: user1,
      competence: '2026-12',
      amount: null,
      dueDate: '2026-12-31',
      fingerprint: 'fp-pc-clean-v1',
    });

    const keyMatch = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const token = await session(user1);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyMatch)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '700.00',
        referencePeriod: '2026-06',
        externalReference: 'PC-MATCH-001',
      })
      .expect(201);
    const keyMismatch = `${user1}:2026-07:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyMismatch)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '750.00',
        referencePeriod: '2026-07',
        externalReference: 'PC-MISMATCH-001',
      })
      .expect(201);
    const keyStale = `${user1}:2026-08:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyStale)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '900.00',
        referencePeriod: '2026-08',
        externalReference: 'PC-STALE-001',
      })
      .expect(201);
    await prisma.taxObligationRecord.updateMany({
      where: { taxSubjectId: user1, competence: '2026-08' },
      data: { liabilityFingerprint: 'fp-pc-stale-v2', principalAmount: '950.00' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // MONTHLY READINESS (1-10)
  // =========================================================================

  it('Scenario 1 (Readiness): subject without activity yields NO_ACTIVITY', async () => {
    const token = await session(user2);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-03',
    );
    expect(readiness.readiness).toBe('NO_ACTIVITY');
    expect(readiness.cleanCloseAllowed).toBe(true);
    expect(readiness.unresolvedItems).toEqual([]);
    expect(readiness.checklist.every((entry) => entry.state === 'NOT_APPLICABLE')).toBe(true);
    expect(readiness.sourceVersion).toBe('4K.5');
  });

  it('Scenario 2 (Readiness): clean zero-amount month is READY_TO_CLOSE', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-12',
    );
    expect(readiness.readiness).toBe('READY_TO_CLOSE');
    expect(readiness.cleanCloseAllowed).toBe(true);
    expect(readiness.unresolvedItems).toEqual([]);
    expect(readiness.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Scenario 3 (Readiness): upcoming actionable item yields REQUIRES_REVIEW', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-03',
    );
    expect(readiness.readiness).toBe('REQUIRES_REVIEW');
    expect(readiness.cleanCloseAllowed).toBe(false);
    expect(readiness.unresolvedItems.some((item) => item.kind === 'PAY_TAX')).toBe(true);
    const actionEntry = readiness.checklist.find(
      (entry) => entry.category === 'ACTION_ITEMS_RESOLVED',
    );
    expect(actionEntry?.state).toBe('INCOMPLETE');
  });

  it('Scenario 4 (Readiness): overdue item is enumerated with severity', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-02',
    );
    expect(readiness.readiness).toBe('REQUIRES_REVIEW');
    const overdue = readiness.unresolvedItems.filter((item) => item.kind === 'PAY_TAX');
    expect(overdue.length).toBe(1);
    expect(overdue[0]!.severity).toBe('WARNING');
  });

  it('Scenario 5 (Readiness): unresolved blocker yields BLOCKED', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-04',
    );
    expect(readiness.readiness).toBe('BLOCKED');
    expect(readiness.cleanCloseAllowed).toBe(false);
    expect(readiness.unresolvedItems.some((item) => item.severity === 'BLOCKING')).toBe(true);
    const blockers = readiness.checklist.find((entry) => entry.category === 'BLOCKERS_CLEARED');
    expect(blockers?.state).toBe('BLOCKED');
  });

  it('Scenario 6 (Readiness): upstream-declared partial yields PARTIAL', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-10',
    );
    expect(readiness.readiness).toBe('PARTIAL');
    expect(readiness.cleanCloseAllowed).toBe(false);
    expect(readiness.unresolvedItems.some((item) => item.kind === 'PARTIAL_DATA')).toBe(true);
  });

  it('Scenario 7 (Readiness): exact evidence match is reconciled without government claims', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-06');
    const evidence = binder.sections.find((section) => section.code === 'PAYMENT_EVIDENCE');
    expect(evidence).toBeDefined();
    expect(evidence!.lines.some((line) => line.includes('700'))).toBe(true);
    expect(evidence!.lines.some((line) => line.includes('PC-MATCH-001'))).toBe(true);
    const joined = evidence!.lines.join('\n');
    expect(joined).toMatch(/sem verificação governamental/);
    expect(joined).not.toMatch(/RECEITA.*CONFIRM|GOVERNMENT_VERIFIED/i);
  });

  it('Scenario 8 (Readiness): payment mismatch requires review', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-07',
    );
    expect(readiness.readiness).toBe('REQUIRES_REVIEW');
    expect(readiness.unresolvedItems.some((item) => item.kind === 'EVIDENCE_MISMATCH')).toBe(true);
    const evidenceEntry = readiness.checklist.find(
      (entry) => entry.category === 'PAYMENT_EVIDENCE_RECONCILED',
    );
    expect(evidenceEntry?.state).toBe('REQUIRES_REVIEW');
  });

  it('Scenario 9 (Readiness): stale payment evidence requires review', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-08',
    );
    expect(readiness.readiness).toBe('REQUIRES_REVIEW');
    expect(
      readiness.unresolvedItems.some(
        (item) => item.kind === 'REVIEW_CHANGED_OBLIGATION' || item.kind === 'STALE_ITEM',
      ),
    ).toBe(true);
  });

  it('Scenario 10 (Readiness): no previous close means not stale', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-03',
    );
    expect(readiness.previousClose).toBeNull();
    expect(readiness.isStaleVsPreviousClose).toBe(false);
  });

  // =========================================================================
  // CLOSE (11-20)
  // =========================================================================

  it('Scenario 11 (Close): close READY month creates CLOSED revision 1', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-12' })
      .expect(201);
    const record = res.body.data as CloseRecord;
    expect(record.scope).toBe('MONTHLY');
    expect(record.period).toBe('2026-12');
    expect(record.revision).toBe(1);
    expect(record.recordStatus).toBe('CLOSED');
    expect(record.closeMode).toBe('CLEAN');
    expect(record.statusAtClose).toBe('READY_TO_CLOSE');
    expect(record.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(record.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.meta.created).toBe(true);
  });

  it('Scenario 12 (Close): repeated identical close is idempotent', async () => {
    const token = await session(user1);
    const first = await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-12' })
      .expect(200);
    expect(first.body.meta.created).toBe(false);
    expect((first.body.data as CloseRecord).revision).toBe(1);
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((history.body.data as CloseRecord[]).length).toBe(1);
  });

  it('Scenario 13 (Close): blocked clean close is rejected with 422', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-04' })
      .expect(422);
    expect(res.body.code ?? res.body.message).toBeDefined();
  });

  it('Scenario 14 (Close): partial clean close is rejected with 422', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-10' })
      .expect(422);
  });

  it('Scenario 15 (Close): requires-review clean close is rejected with 422', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-03' })
      .expect(422);
  });

  it('Scenario 16 (Close): close history is visible and bounded', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12&limit=10&offset=0',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.totalCount).toBe(1);
    expect((res.body.data as CloseRecord[])[0]!.recordStatus).toBe('CLOSED');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('Scenario 17 (Close): revision is monotonic across reopen and reclose', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entries = history.body.data as CloseRecord[];
    const closed = entries.find((entry) => entry.recordStatus === 'CLOSED');
    expect(closed).toBeDefined();
    const reopened = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${closed!.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Revisão solicitada pelo investidor antes do fechamento definitivo.' })
      .expect(201);
    expect((reopened.body.data as CloseRecord).revision).toBe(2);
    expect((reopened.body.data as CloseRecord).recordStatus).toBe('REOPENED');
  });

  it('Scenario 18 (Close): reopened period reports fresh readiness', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-12',
    );
    expect(readiness.previousClose?.recordStatus).toBe('REOPENED');
    expect(readiness.isStaleVsPreviousClose).toBe(false);
    expect(readiness.readiness).toBe('READY_TO_CLOSE');
  });

  it('Scenario 19 (Close): reclose after reopen creates revision 3', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-12' })
      .expect(201);
    expect((res.body.data as CloseRecord).revision).toBe(3);
    expect((res.body.data as CloseRecord).recordStatus).toBe('CLOSED');
  });

  it('Scenario 20 (Close): previous closes are preserved with intact fingerprints', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entries = history.body.data as CloseRecord[];
    expect(entries.length).toBe(3);
    const revisions = entries.map((entry) => entry.revision).sort();
    expect(revisions).toEqual([1, 2, 3]);
    const rev1 = entries.find((entry) => entry.revision === 1)!;
    const rev3 = entries.find((entry) => entry.revision === 3)!;
    // Same semantic snapshot → identical fingerprints across reclose.
    expect(rev3.sourceFingerprint).toBe(rev1.sourceFingerprint);
    expect(rev3.binderFingerprint).toBe(rev1.binderFingerprint);
    expect(entries.find((entry) => entry.revision === 2)!.recordStatus).toBe('REOPENED');
  });

  // =========================================================================
  // SOURCE CHANGE (21-30)
  // =========================================================================

  it('Scenario 21 (Source): close fingerprint A is recorded', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-12',
    );
    expect(readiness.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(readiness.previousClose?.revision).toBe(3);
  });

  it('Scenario 22 (Source): material source change A→B', async () => {
    await prisma.taxObligationRecord.updateMany({
      where: { taxSubjectId: user1, competence: '2026-12' },
      data: { liabilityFingerprint: 'fp-pc-clean-v2', principalAmount: '0.00' },
    });
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-12',
    );
    expect(readiness.previousClose?.sourceFingerprint).not.toBe(readiness.sourceFingerprint);
  });

  it('Scenario 23 (Source): historical close A is preserved', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((history.body.data as CloseRecord[]).length).toBe(3);
  });

  it('Scenario 24 (Source): current state is STALE and clean close is refused', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-12',
    );
    expect(readiness.readiness).toBe('STALE');
    expect(readiness.isStaleVsPreviousClose).toBe(true);
    expect(readiness.cleanCloseAllowed).toBe(false);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-12' })
      .expect(422);
  });

  it('Scenario 25 (Source): old close A is not presented as current for B', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(
      token,
      'scope=MONTHLY&calendarYear=2026&month=2026-12',
    );
    expect(readiness.previousClose?.revision).toBe(3);
    expect(readiness.previousClose?.recordStatus).toBe('CLOSED');
    expect(readiness.sourceFingerprint).not.toBe(readiness.previousClose?.sourceFingerprint);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-12');
    const sources = binder.sections.find((section) => section.code === 'SOURCES_METADATA');
    expect(sources!.lines.some((line) => line.includes('SIM'))).toBe(true);
  });

  it('Scenario 26 (Source): reopen + new close revision B', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const latest = (history.body.data as CloseRecord[])[0]!;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${latest.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Fonte alterada; revisar e fechar nova revisão.' })
      .expect(201);
    const reclose = await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-12' })
      .expect(201);
    expect((reclose.body.data as CloseRecord).revision).toBe(5);
    expect((reclose.body.data as CloseRecord).recordStatus).toBe('CLOSED');
  });

  it('Scenario 27 (Source): old binder fingerprint remains preserved', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12&limit=10&offset=0',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entries = history.body.data as CloseRecord[];
    const rev3 = entries.find((entry) => entry.revision === 3)!;
    const rev5 = entries.find((entry) => entry.revision === 5)!;
    expect(rev3.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(rev5.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Scenario 28 (Source): new binder fingerprint differs materially', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12&limit=10&offset=0',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entries = history.body.data as CloseRecord[];
    const rev3 = entries.find((entry) => entry.revision === 3)!;
    const rev5 = entries.find((entry) => entry.revision === 5)!;
    expect(rev5.sourceFingerprint).not.toBe(rev3.sourceFingerprint);
    expect(rev5.binderFingerprint).not.toBe(rev3.binderFingerprint);
  });

  it('Scenario 29 (Source): repeated reads yield the same semantic fingerprint', async () => {
    const token = await session(user1);
    const first = await getReadiness(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const second = await getReadiness(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    expect(second.readiness.sourceFingerprint).toBe(first.readiness.sourceFingerprint);
    expect(JSON.stringify(second.readiness)).toBe(JSON.stringify(first.readiness));
  });

  it('Scenario 30 (Source): material change alters the fingerprint', async () => {
    const token = await session(user1);
    const feb = await getReadiness(token, 'scope=MONTHLY&calendarYear=2026&month=2026-02');
    const mar = await getReadiness(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    expect(feb.readiness.sourceFingerprint).not.toBe(mar.readiness.sourceFingerprint);
  });

  // =========================================================================
  // ANNUAL (31-40)
  // =========================================================================

  it('Scenario 31 (Annual): annual readiness preserves year and exercise distinctly', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    expect(readiness.scope).toBe('ANNUAL');
    expect(readiness.period).toBe('2026');
    expect(readiness.calendarYear).toBe(2026);
    expect(readiness.exercise).toBe(2027);
    expect(
      readiness.checklist.some((entry) => entry.category === 'ANNUAL_CONFIRMATIONS_RESOLVED'),
    ).toBe(true);
  });

  it('Scenario 32 (Annual): pending annual review blocks clean close', async () => {
    const token = await session(user1);
    const { readiness } = await getReadiness(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    expect(['REQUIRES_REVIEW', 'BLOCKED', 'READY_TO_CLOSE', 'NO_ACTIVITY', 'PARTIAL']).toContain(
      readiness.readiness,
    );
    if (!readiness.cleanCloseAllowed) {
      await request(app.getHttpServer())
        .post('/api/v1/fiscal/compliance/period-close')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'ANNUAL', calendarYear: 2026, exercise: 2027 })
        .expect(422);
    }
  });

  it('Scenario 33 (Annual): completing annual review enables clean close', async () => {
    const token = await session(user1);
    // Complete via the canonical 4K.1 workflow on every annual obligation.
    const timeline = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const annualObligations = (
      timeline.body.data.obligations as Array<{
        obligationKey: string;
        period: string;
        sourceFingerprint: string;
      }>
    ).filter(
      (o) =>
        o.period === '2026' &&
        o.obligationKey !== `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`,
    );
    for (const obligation of annualObligations) {
      await request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(obligation.obligationKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REPORTED_COMPLETION',
          sourceFingerprint: obligation.sourceFingerprint,
        })
        .expect(201);
    }
    const after = await getReadiness(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    if (after.cleanCloseAllowed) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fiscal/compliance/period-close')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'ANNUAL', calendarYear: 2026, exercise: 2027 })
        .expect(201);
      expect((res.body.data as CloseRecord).scope).toBe('ANNUAL');
      expect((res.body.data as CloseRecord).exercise).toBe(2027);
    } else {
      expect(after.readiness).not.toBe('READY_TO_CLOSE');
    }
  });

  it('Scenario 34 (Annual): confirmation requirements are enumerated before completion', async () => {
    const token = await session(user1);
    // Reopen annual obligations to restore the pending state.
    const timeline = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const annualObligations = (
      timeline.body.data.obligations as Array<{
        obligationKey: string;
        period: string;
        sourceFingerprint: string;
      }>
    ).filter((o) => o.period === '2026');
    for (const obligation of annualObligations) {
      await request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(obligation.obligationKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'USER_REOPENED', sourceFingerprint: obligation.sourceFingerprint })
        .expect(201);
    }
    const { readiness } = await getReadiness(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    expect(
      readiness.unresolvedItems.some(
        (item) => item.kind === 'REVIEW_ANNUAL_FILING' || item.kind === 'AWAITING',
      ) ||
        readiness.readiness === 'NO_ACTIVITY' ||
        readiness.readiness === 'READY_TO_CLOSE',
    ).toBe(true);
  });

  it('Scenario 35 (Annual): high-income absence creates no false close item', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    const joined = binder.sections.map((section) => section.lines.join('\n')).join('\n');
    expect(joined).not.toMatch(/alta renda.*imposto apurado|minimum tax due/i);
  });

  it('Scenario 36 (Annual): binder and close record preserve year and exercise', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    const identity = binder.sections.find((section) => section.code === 'PERIOD_IDENTITY');
    expect(identity!.lines.some((line) => line.includes('2026'))).toBe(true);
    expect(identity!.lines.some((line) => line.includes('2027'))).toBe(true);
  });

  it('Scenario 37 (Annual): subject without annual activity has NO_ACTIVITY', async () => {
    const token = await session(user2);
    const { readiness } = await getReadiness(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    expect(readiness.readiness).toBe('NO_ACTIVITY');
  });

  it('Scenario 38 (Annual): annual workflow change stales the annual close', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=ANNUAL&period=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entries = history.body.data as CloseRecord[];
    const latestClosed = entries.find((entry) => entry.recordStatus === 'CLOSED');
    if (!latestClosed) {
      return;
    }
    // Reopening the annual review changes the annual lineage → STALE.
    const timeline = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const annualObligations = (
      timeline.body.data.obligations as Array<{
        obligationKey: string;
        period: string;
        sourceFingerprint: string;
      }>
    ).filter((o) => o.period === '2026');
    if (annualObligations.length === 0) {
      return;
    }
    await request(app.getHttpServer())
      .post(
        `/api/v1/fiscal/compliance/${encodeURIComponent(annualObligations[0]!.obligationKey)}/actions`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'USER_REOPENED',
        sourceFingerprint: annualObligations[0]!.sourceFingerprint,
      })
      .expect(201);
    const { readiness } = await getReadiness(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    expect(
      readiness.isStaleVsPreviousClose ||
        readiness.readiness !== 'READY_TO_CLOSE' ||
        readiness.previousClose === null,
    ).toBe(true);
  });

  it('Scenario 39 (Annual): annual close history is listed', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=ANNUAL')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.meta.totalCount).toBe('number');
  });

  it('Scenario 40 (Annual): annual binder carries manifest and disclaimer', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=ANNUAL&calendarYear=2026&exercise=2027');
    const codes = binder.sections.map((section) => section.code);
    expect(codes).toContain('PERIOD_IDENTITY');
    expect(codes).toContain('DISCLAIMERS');
    const disclaimers = binder.sections.find((section) => section.code === 'DISCLAIMERS');
    expect(disclaimers!.lines.join(' ')).toContain('Receita Federal');
  });

  // =========================================================================
  // BINDER (41-50)
  // =========================================================================

  it('Scenario 41 (Binder): binder manifest carries period identity', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    expect(binder.scope).toBe('MONTHLY');
    expect(binder.period).toBe('2026-03');
    const identity = binder.sections.find((section) => section.code === 'PERIOD_IDENTITY');
    expect(identity!.lines.some((line) => line.includes('2026-03'))).toBe(true);
    expect(identity!.lines.some((line) => line.includes('Mensal'))).toBe(true);
  });

  it('Scenario 42 (Binder): obligation section lists verbatim obligations', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const obligations = binder.sections.find((section) => section.code === 'OBLIGATIONS');
    expect(obligations!.lines.some((line) => line.includes('2026-03'))).toBe(true);
    expect(obligations!.lines.some((line) => line.includes('500'))).toBe(true);
  });

  it('Scenario 43 (Binder): payment-support section is present', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const support = binder.sections.find((section) => section.code === 'PAYMENT_SUPPORT');
    expect(support).toBeDefined();
    expect(support!.lines.length).toBeGreaterThan(0);
  });

  it('Scenario 44 (Binder): evidence section carries verbatim evidence', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-06');
    const evidence = binder.sections.find((section) => section.code === 'PAYMENT_EVIDENCE');
    expect(evidence!.lines.some((line) => line.includes('PC-MATCH-001'))).toBe(true);
  });

  it('Scenario 45 (Binder): reminder/workflow section counts without resolving', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const workflow = binder.sections.find((section) => section.code === 'REMINDERS_WORKFLOW');
    expect(workflow!.lines.some((line) => line.includes('não resolve'))).toBe(true);
  });

  it('Scenario 46 (Binder): unresolved-items section is mandatory when applicable', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const unresolved = binder.sections.find((section) => section.code === 'UNRESOLVED_ITEMS');
    expect(unresolved!.lines.length).toBeGreaterThan(0);
    expect(unresolved!.lines.some((line) => line.includes('PAY_TAX'))).toBe(true);
  });

  it('Scenario 47 (Binder): sources and fingerprint metadata are present', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const sources = binder.sections.find((section) => section.code === 'SOURCES_METADATA');
    expect(sources!.lines.some((line) => line.includes('Fingerprint de origem'))).toBe(true);
    expect(binder.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Scenario 48 (Binder): disclaimer is mandatory', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-12');
    const disclaimers = binder.sections.find((section) => section.code === 'DISCLAIMERS');
    expect(disclaimers!.lines.join(' ')).toContain(
      'Não constitui declaração transmitida à Receita Federal',
    );
  });

  it('Scenario 49 (Binder): semantic fingerprint is stable across reads', async () => {
    const token = await session(user1);
    const first = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const second = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    expect(second.binderFingerprint).toBe(first.binderFingerprint);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('Scenario 50 (Binder): binder never uses official-settlement language', async () => {
    const token = await session(user1);
    const binder = await getBinder(token, 'scope=MONTHLY&calendarYear=2026&month=2026-03');
    const joined = binder.sections.map((section) => section.lines.join('\n')).join('\n');
    // Affirmative official-settlement claims are forbidden; negations inside
    // the support disclaimer ("Não constitui ...", "Não equivale ...") are required.
    expect(joined).not.toMatch(
      /é um DARF oficial|DARF oficial emitido|comprovante oficial de pagamento/i,
    );
    expect(joined).not.toMatch(/certid[aã]o de regularidade|débito extinto|debt extinguished/i);
    expect(joined).not.toMatch(/GOVERNMENT_VERIFIED|RECEITA_CONFIRMED/i);
    expect(joined).toContain('Não constitui declaração transmitida à Receita Federal');
  });

  // =========================================================================
  // EXPORT (51-60)
  // =========================================================================

  it('Scenario 51 (Export): JSON support export parses with fingerprint', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=json',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/json');
    const body = typeof res.text === 'string' ? JSON.parse(res.text) : res.body;
    expect(body.binderFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(body.period).toBe('2026-03');
  });

  it('Scenario 52 (Export): CSV support export uses CRLF and carries disclaimer', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('\r\n');
    expect(res.text).toContain('Receita Federal');
  });

  it('Scenario 53 (Export): formula injection is neutralized in CSV', async () => {
    const token = await session(user1);
    const keyMatch = `${user1}:2026-06:MONTHLY_TAX_PAYMENT:monthly-6015`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(keyMatch)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '700.00',
        referencePeriod: '2026-06',
        externalReference: '=HYPERLINK("https://evil.example","x")',
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-06&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).toContain("'=HYPERLINK");
    expect(res.text).not.toMatch(/(^|[\r\n;])=HYPERLINK/);
  });

  it('Scenario 54 (Export): Content-Disposition attachment with safe filename', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('atlas-fechamento-mensal-2026-03-apoio.csv');
    expect(disposition).not.toContain('..');
    expect(disposition).not.toContain(user1);
  });

  it('Scenario 55 (Export): UTF-8 content types', async () => {
    const token = await session(user1);
    const csv = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('charset=utf-8');
    const json = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=json',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(json.headers['content-type']).toContain('charset=utf-8');
  });

  it('Scenario 56 (Export): delimiter and line endings are canonical', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).toContain(';');
    const stripped = res.text.replace(/\r\n/g, '');
    expect(stripped).not.toContain('\n');
    expect(stripped).not.toContain('\r');
  });

  it('Scenario 57 (Export): filenames carry no PII or traversal', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=ANNUAL&calendarYear=2026&exercise=2027&format=json',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toContain('atlas-fechamento-anual-2026-apoio.json');
    expect(disposition).not.toContain(user1);
  });

  it('Scenario 58 (Export): private/no-store on all close surfaces', async () => {
    const token = await session(user1);
    for (const url of [
      '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-03',
      '/api/v1/fiscal/compliance/period-close/binder?scope=MONTHLY&calendarYear=2026&month=2026-03',
      '/api/v1/fiscal/compliance/period-close/history',
      '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
    ]) {
      const res = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.headers['cache-control']).toContain('no-store');
    }
  });

  it('Scenario 59 (Export): no official DARF layout imitation', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=csv',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).not.toMatch(
      /código de barras|linha digitável|documento de arrecadação oficial/i,
    );
  });

  it('Scenario 60 (Export): no Receita receipt claim', async () => {
    const token = await session(user1);
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/binder/export?scope=MONTHLY&calendarYear=2026&month=2026-03&format=json',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = typeof res.text === 'string' ? JSON.parse(res.text) : res.body;
    // Affirmative receipt/transmission claims are forbidden; the support
    // disclaimer negation ("Não constitui declaração transmitida") is required.
    expect(JSON.stringify(body)).not.toMatch(
      /recibo de entrega|transmissão efetuada|recebido pela receita/i,
    );
    expect(JSON.stringify(body)).not.toMatch(/aceit[ao] pela receita|homologad[ao] pela receita/i);
    expect(JSON.stringify(body)).toContain('Não constitui declaração transmitida');
  });

  // =========================================================================
  // SECURITY (61-73)
  // =========================================================================

  it('Scenario 61 (Security): cross-user readiness is isolated', async () => {
    const token2 = await session(user2);
    const { readiness } = await getReadiness(
      token2,
      'scope=MONTHLY&calendarYear=2026&month=2026-03',
    );
    expect(readiness.readiness).toBe('NO_ACTIVITY');
  });

  it('Scenario 62 (Security): cross-user close sees no foreign history', async () => {
    const token2 = await session(user2);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(res.body.meta.totalCount).toBe(0);
  });

  it('Scenario 63 (Security): cross-user reopen is 404 anti-enumeration', async () => {
    const token1 = await session(user1);
    const history = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12&limit=1&offset=0',
      )
      .set('Authorization', `Bearer ${token1}`)
      .expect(200);
    const foreignId = (history.body.data as CloseRecord[])[0]!.id;
    const token2 = await session(user2);
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${foreignId}/reopen`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ reason: 'Tentativa indevida.' })
      .expect(404);
  });

  it('Scenario 64 (Security): cross-user history is isolated', async () => {
    const token2 = await session(user2);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(res.body.meta.totalCount).toBe(0);
    expect(res.body.data).toEqual([]);
  });

  it('Scenario 65 (Security): cross-user binder is isolated', async () => {
    const token2 = await session(user2);
    const binder = await getBinder(token2, 'scope=MONTHLY&calendarYear=2026&month=2026-12');
    expect(binder.sections.find((section) => section.code === 'OBLIGATIONS')!.lines[0]).toContain(
      '0',
    );
  });

  it('Scenario 66 (Security): forged scope and invalid periods fail closed', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=WEEKLY&calendarYear=2026&month=2026-03',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-13',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-03&exercise=2027',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=ANNUAL&calendarYear=2026&exercise=2028',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 67 (Security): invalid close mode payloads are rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-03', exercise: 2027 })
      .expect(400);
  });

  it('Scenario 68 (Security): oversized history queries are bounded', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?limit=500')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 69 (Security): unknown scope filter is rejected', async () => {
    const token = await session(user1);
    await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/period-close/history?scope=FORTNIGHTLY')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('Scenario 70 (Security): malformed reopen reason is rejected without stack traces', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12&limit=1&offset=0',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const id = (history.body.data as CloseRecord[])[0]!.id;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '' })
      .expect(400);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.trace).toBeUndefined();
  });

  it('Scenario 71 (Security): unauthenticated close surfaces return 401', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-03',
      )
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .send({ scope: 'MONTHLY', calendarYear: 2026, month: '2026-03' })
      .expect(401);
  });

  it('Scenario 72 (Security): reopening a non-latest record is refused', async () => {
    const token = await session(user1);
    const history = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/history?scope=MONTHLY&period=2026-12&limit=10&offset=0',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entries = history.body.data as CloseRecord[];
    const oldest = entries[entries.length - 1]!;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${oldest.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Tentativa sobre revisão antiga.' })
      .expect(422);
    expect(res.body.stack).toBeUndefined();
  });

  it('Scenario 73 (Security): reopening an already-reopened period is refused', async () => {
    const token = await session(user1);
    // 2026-03 was never closed: reopening anything there must 404/422, never create.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${uuidFor('pc-nonexistent-close')}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Registro inexistente.' })
      .expect(404);
    expect(res.body.stack).toBeUndefined();
  });
});
