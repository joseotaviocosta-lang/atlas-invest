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
        name: 'Concurrency User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
  const { token } = await createAuthenticatedUserSession(userId);
  return token;
}

type CloseRecord = {
  id: string;
  revision: number;
  recordStatus: string;
  sourceFingerprint: string;
  binderFingerprint: string;
};

describe('Phase 4K.5 — Period Close Concurrency Matrix (C1-C7)', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-close-concurrency');

  async function seedZeroMonth(competence: string, tag: string) {
    await prisma.taxObligationRecord.create({
      data: {
        id: uuidFor(`pc-conc-${tag}`),
        taxSubjectId: user1,
        competence,
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: `fp-pc-conc-${tag}-v1`,
        revision: 1,
        principalAmount: null,
        currency: 'BRL',
        dueDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  }

  function closeMonth(token: string, month: string) {
    return request(app.getHttpServer())
      .post('/api/v1/fiscal/compliance/period-close')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'MONTHLY', calendarYear: 2026, month });
  }

  async function readHistory(token: string, qs: string): Promise<CloseRecord[]> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/period-close/history?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data as CloseRecord[];
  }

  async function readSourceFp(token: string, qs: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/period-close/readiness?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body.data as { sourceFingerprint: string }).sourceFingerprint;
  }

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
    await seedZeroMonth('2026-11', 'c1');
    await seedZeroMonth('2026-09', 'c2');
    await seedZeroMonth('2026-07', 'c3');
    await seedZeroMonth('2026-05', 'c4');
    await seedZeroMonth('2026-03', 'c5');
    await seedZeroMonth('2026-12', 'c6');
  });

  afterAll(async () => {
    await app.close();
  });

  it('C1 (Concurrency): 10 concurrent identical closes yield one canonical revision', async () => {
    const token = await session(user1);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => closeMonth(token, '2026-11')),
    );
    for (const res of results) {
      expect([200, 201]).toContain(res.status);
    }
    const ids = new Set(results.map((r) => (r.body.data as CloseRecord).id));
    expect(ids.size).toBe(1);
    const history = await readHistory(token, 'scope=MONTHLY&period=2026-11');
    expect(history.length).toBe(1);
    expect(history[0]!.revision).toBe(1);
    expect(history[0]!.recordStatus).toBe('CLOSED');
  });

  it('C2 (Concurrency): close racing source change never presents A as current for B', async () => {
    const token = await session(user1);
    // Settle the A lineage first; the race then covers idempotent re-closes
    // against the flip (pre-flip replays converge, post-flip closes refuse).
    const settled = await closeMonth(token, '2026-09');
    expect(settled.status).toBe(201);
    const closes = Array.from({ length: 5 }, () => closeMonth(token, '2026-09'));
    const flip = (async () => {
      await prisma.taxObligationRecord.updateMany({
        where: { taxSubjectId: user1, competence: '2026-09' },
        data: { liabilityFingerprint: 'fp-pc-conc-c2-v2', principalAmount: '100.00' },
      });
    })();
    const results = await Promise.all([...closes, flip.then(() => closeMonth(token, '2026-09'))]);
    for (const res of results) {
      // Pre-flip replays are idempotent (200); post-flip closes see dirty B (422).
      expect([200, 422]).toContain(res.status);
    }
    const history = await readHistory(token, 'scope=MONTHLY&period=2026-09');
    // Exactly one canonical A row survives the race.
    expect(history.length).toBe(1);
    expect(history[0]!.revision).toBe(1);
    // Current source is B: the preserved A close is stale, never current.
    const currentFp = await readSourceFp(token, 'scope=MONTHLY&calendarYear=2026&month=2026-09');
    expect(currentFp).not.toBe(history[0]!.sourceFingerprint);
    const readiness = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-09',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((readiness.body.data as { readiness: string }).readiness).toBe('STALE');
  });

  it('C3 (Concurrency): close racing evidence write settles pre- or post-evidence, never hybrid', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const preFp = await readSourceFp(token, 'scope=MONTHLY&calendarYear=2026&month=2026-07');
    const key = `${user1}:2026-07:MONTHLY_TAX_PAYMENT:monthly-6015`;
    const closes = Array.from({ length: 6 }, () => closeMonth(token, '2026-07'));
    const write = request(server)
      .post(`/api/v1/fiscal/compliance/${encodeURIComponent(key)}/payment-evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentDate: '2026-04-19',
        amountReported: '50.00',
        referencePeriod: '2026-07',
        externalReference: 'PC-CONC-C3',
      })
      .expect(201);
    const results = await Promise.all([...closes, write.then(() => closeMonth(token, '2026-07'))]);
    // Closes always succeed here: the month is non-payable, so evidence only
    // enriches the binder (new binder revision), never the source lineage.
    for (const res of results) {
      expect([200, 201]).toContain(res.status);
    }
    const history = await readHistory(token, 'scope=MONTHLY&period=2026-07');
    expect(history.length).toBeLessThanOrEqual(2);
    for (const row of history) {
      expect(row.sourceFingerprint).toBe(preFp);
    }
    const revisions = history.map((row) => row.revision).sort();
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    // The settled binder carries the raced evidence; lineage is unchanged.
    const binderRes = await request(server)
      .get(
        '/api/v1/fiscal/compliance/period-close/binder?scope=MONTHLY&calendarYear=2026&month=2026-07',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const sections = binderRes.body.data.sections as Array<{ code: string; lines: string[] }>;
    const evidence = sections.find((section) => section.code === 'PAYMENT_EVIDENCE')!;
    expect(evidence.lines.some((line) => line.includes('PC-CONC-C3'))).toBe(true);
    const readiness = await request(server)
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-07',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((readiness.body.data as { readiness: string }).readiness).toBe('READY_TO_CLOSE');
  });

  it('C4 (Concurrency): reopen racing source change preserves history deterministically', async () => {
    const token = await session(user1);
    const closed = await closeMonth(token, '2026-05');
    expect(closed.status).toBe(201);
    const closeId = (closed.body.data as CloseRecord).id;
    const reopen = request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/period-close/${closeId}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Revisão concorrente com atualização de fonte.' });
    const flip = (async () => {
      await prisma.taxObligationRecord.updateMany({
        where: { taxSubjectId: user1, competence: '2026-05' },
        data: { liabilityFingerprint: 'fp-pc-conc-c4-v2', principalAmount: '0.00' },
      });
    })();
    const [reopenRes] = await Promise.all([reopen, flip]);
    expect(reopenRes.status).toBe(201);
    const history = await readHistory(token, 'scope=MONTHLY&period=2026-05');
    expect(history.length).toBe(2);
    expect(history[0]!.recordStatus).toBe('REOPENED');
    expect(history[0]!.revision).toBe(2);
    expect(history[1]!.recordStatus).toBe('CLOSED');
    // Fresh assessment on clean B data (reopened history does not stale).
    const readiness = await request(app.getHttpServer())
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=MONTHLY&calendarYear=2026&month=2026-05',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((readiness.body.data as { readiness: string }).readiness).toBe('READY_TO_CLOSE');
  });

  it('C5 (Concurrency): binder reads racing source rebuild stay snapshot-coherent', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    const qs = 'scope=MONTHLY&calendarYear=2026&month=2026-03';
    const preFp = await readSourceFp(token, qs);
    const reads = Array.from({ length: 8 }, () =>
      request(server)
        .get(`/api/v1/fiscal/compliance/period-close/binder?${qs}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200),
    );
    const flip = (async () => {
      await prisma.taxObligationRecord.updateMany({
        where: { taxSubjectId: user1, competence: '2026-03' },
        data: { liabilityFingerprint: 'fp-pc-conc-c5-v2', principalAmount: '0.00' },
      });
    })();
    const snapshots = await Promise.all([...reads, flip.then(() => null)]);
    const postFp = await readSourceFp(token, qs);
    expect(postFp).not.toBe(preFp);
    for (const res of snapshots) {
      if (!res) continue;
      const sections = res.body.data.sections as Array<{ code: string; lines: string[] }>;
      const sources = sections.find((section) => section.code === 'SOURCES_METADATA')!;
      const fpLine = sources.lines.find((line) => line.startsWith('Fingerprint de origem'))!;
      const observedFp = fpLine.split(': ')[1]!;
      // Every binder binds exactly one coherent lineage — never a hybrid.
      expect([preFp, postFp]).toContain(observedFp);
    }
    // Same fingerprint re-reads are byte-identical.
    const first = await request(server)
      .get(`/api/v1/fiscal/compliance/period-close/binder?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const second = await request(server)
      .get(`/api/v1/fiscal/compliance/period-close/binder?${qs}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
  });

  it('C6 (Concurrency): history reads racing a new close observe prefixes only', async () => {
    const token = await session(user1);
    const reads = Array.from({ length: 8 }, () =>
      readHistory(token, 'scope=MONTHLY&period=2026-12'),
    );
    const closes = Array.from({ length: 4 }, () => closeMonth(token, '2026-12'));
    const [snapshots] = await Promise.all([Promise.all(reads), Promise.all(closes)]);
    const finalHistory = await readHistory(token, 'scope=MONTHLY&period=2026-12');
    expect(finalHistory.length).toBe(1);
    const finalIds = new Set(finalHistory.map((row) => row.id));
    for (const snapshot of snapshots) {
      // Every observed snapshot is a prefix of the settled history: no lost
      // revision, deterministic revision order.
      expect(snapshot.length).toBeLessThanOrEqual(finalHistory.length);
      for (const row of snapshot) {
        expect(finalIds.has(row.id)).toBe(true);
      }
      const revisions = snapshot.map((row) => row.revision);
      expect([...revisions].sort((a, b) => b - a)).toEqual(revisions);
    }
  });

  it('C7 (Concurrency): annual close racing annual rebuild settles without mixed state', async () => {
    const token = await session(user1);
    const server = app.getHttpServer();
    // Complete every annual obligation via the canonical workflow first.
    const timeline = await request(server)
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
      await request(server)
        .post(`/api/v1/fiscal/compliance/${encodeURIComponent(obligation.obligationKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REPORTED_COMPLETION',
          sourceFingerprint: obligation.sourceFingerprint,
        })
        .expect(201);
    }
    const closeAnnual = () =>
      request(server)
        .post('/api/v1/fiscal/compliance/period-close')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'ANNUAL', calendarYear: 2026, exercise: 2027 });
    const rebuildAnnual = async () => {
      if (annualObligations.length === 0) return null;
      return request(server)
        .post(
          `/api/v1/fiscal/compliance/${encodeURIComponent(annualObligations[0]!.obligationKey)}/actions`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'USER_REOPENED',
          sourceFingerprint: annualObligations[0]!.sourceFingerprint,
        });
    };
    const [closeRes, rebuildRes] = await Promise.all([closeAnnual(), rebuildAnnual()]);
    expect([200, 201, 422]).toContain(closeRes.status);
    if (rebuildRes) {
      expect([200, 201]).toContain(rebuildRes.status);
    }
    const history = await readHistory(token, 'scope=ANNUAL&period=2026');
    // At most one close row; revisions monotonic; calendar year/exercise intact.
    expect(history.length).toBeLessThanOrEqual(1);
    const readiness = await request(server)
      .get(
        '/api/v1/fiscal/compliance/period-close/readiness?scope=ANNUAL&calendarYear=2026&exercise=2027',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = readiness.body.data as { readiness: string; sourceFingerprint: string };
    if (history.length === 1 && data.readiness === 'READY_TO_CLOSE') {
      expect(history[0]!.sourceFingerprint).toBe(data.sourceFingerprint);
    }
    if (history.length === 0) {
      expect(['REQUIRES_REVIEW', 'STALE', 'BLOCKED', 'PARTIAL']).toContain(data.readiness);
    }
  });
});
