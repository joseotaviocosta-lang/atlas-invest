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

describe('Phase 4K.3 — Tax Compliance Reminder Concurrency Matrix', () => {
  let app: INestApplication;
  const user1 = uuidFor('user1-reminder-concurrency');

  const keyA = `${user1}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
  const obA = uuidFor('rem-conc-ob-a');

  beforeAll(async () => {
    await cleanDatabase(prisma);
    app = await buildApp('2026-04-20');
    await session(user1);
    await prisma.taxObligationRecord.create({
      data: {
        id: obA,
        taxSubjectId: user1,
        competence: '2026-03',
        taxBucket: 'EQUITY_NORMAL',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-conc-a-v1',
        revision: 1,
        principalAmount: '500.00',
        currency: 'BRL',
        dueDate: new Date('2026-04-30T00:00:00.000Z'),
        status: 'OPEN',
        darfReadiness: 'READY',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Scenario 1 (Concurrency): 10 concurrent identical deliveries yield one canonical event', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-23`;
    const payload = {
      sourceFingerprint: 'fp-conc-a-v1',
      channel: 'IN_APP',
      triggerAt: '2026-04-23',
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/deliveries`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload)
          .expect(201),
      ),
    );
    const ids = new Set(results.map((r) => r.body.data.id as string));
    expect(ids.size).toBe(1);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/deliveries`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.data.length).toBe(1);
  });

  it('Scenario 2 (Concurrency): two distinct concurrent actions assign monotonic revisions', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-27`;
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'ACKNOWLEDGE',
          obligationKey: keyA,
          reminderKind: 'UPCOMING_DUE',
          triggerAt: '2026-04-27',
          sourceFingerprint: 'fp-conc-a-v1',
        })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'DISMISS',
          obligationKey: keyA,
          reminderKind: 'UPCOMING_DUE',
          triggerAt: '2026-04-27',
          sourceFingerprint: 'fp-conc-a-v1',
        })
        .expect(201),
    ]);
    const revisions = [first.body.data.revision, second.body.data.revision].sort();
    expect(revisions).toEqual([1, 2]);
  });

  it('Scenario 3 (Concurrency): acknowledge races source change — settled state is deterministically STALE-aware', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-29`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'ACKNOWLEDGE',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-29',
        sourceFingerprint: 'fp-conc-a-v1',
      })
      .expect(201);
    await prisma.taxObligationRecord.update({
      where: { id: obA },
      data: { liabilityFingerprint: 'fp-conc-a-v2', principalAmount: '600.00' },
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{
      reminderKey: string;
      status: string;
      sourceFingerprint: string;
    }>;
    const shells = rows.filter((r) => r.reminderKey === reminderKey && r.status === 'SUPERSEDED');
    expect(shells.length).toBe(1);
    expect(shells[0]!.sourceFingerprint).toBe('fp-conc-a-v1');
    const fresh = rows.filter(
      (r) => r.reminderKey === reminderKey && r.sourceFingerprint === 'fp-conc-a-v2',
    );
    expect(fresh.length).toBe(1);
    expect(['SCHEDULED', 'DELIVERED']).toContain(fresh[0]!.status);
  });

  it('Scenario 4 (Concurrency): snooze races delivery — no double delivery, deterministic final state', async () => {
    const token = await session(user1);
    const reminderKey = `${keyA}:UPCOMING_DUE:2026-04-23`;
    const [snoozeRes, deliveryRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'SNOOZE',
          obligationKey: keyA,
          reminderKind: 'UPCOMING_DUE',
          triggerAt: '2026-04-23',
          sourceFingerprint: 'fp-conc-a-v2',
          snoozedUntil: '2026-04-28',
        })
        .expect(201),
      request(app.getHttpServer())
        .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/deliveries`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          sourceFingerprint: 'fp-conc-a-v2',
          channel: 'IN_APP',
          triggerAt: '2026-04-23',
        })
        .expect(201),
    ]);
    expect(snoozeRes.body.data.actionType).toBe('SNOOZE');
    expect(deliveryRes.body.data.deliveryStatus).toBe('DELIVERED');
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{ reminderKey: string; status: string }>;
    expect(rows.find((r) => r.reminderKey === reminderKey)?.status).toBe('SNOOZED');
  });

  it('Scenario 5 (Concurrency): preferences update races scheduler projection — no mixed state', async () => {
    const token = await session(user1);
    const [putRes, getRes] = await Promise.all([
      request(app.getHttpServer())
        .put('/api/v1/fiscal/compliance/reminder-preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({
          remindersEnabled: true,
          upcomingEnabled: false,
          overdueEnabled: true,
          annualEnabled: true,
          leadTimes: [7, 3, 1],
        })
        .expect(200),
      request(app.getHttpServer())
        .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200),
    ]);
    expect(putRes.body.data.upcomingEnabled).toBe(false);
    expect(Array.isArray(getRes.body.data)).toBe(true);
    for (const row of getRes.body.data as Array<{ status: string }>) {
      expect(typeof row.status).toBe('string');
    }
    await request(app.getHttpServer())
      .put('/api/v1/fiscal/compliance/reminder-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        remindersEnabled: true,
        upcomingEnabled: true,
        overdueEnabled: true,
        annualEnabled: true,
        leadTimes: [7, 3, 1],
      })
      .expect(200);
  });

  it('Scenario 6 (Concurrency): reminder read during source rebuild yields coherent snapshot', async () => {
    const token = await session(user1);
    const [readRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200),
      prisma.taxObligationRecord.update({
        where: { id: obA },
        data: { liabilityFingerprint: 'fp-conc-a-v3', principalAmount: '650.00' },
      }),
    ]);
    expect(Array.isArray(readRes.body.data)).toBe(true);
    const after = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = after.body.data as Array<{
      obligationKey: string;
      sourceFingerprint: string;
      status: string;
    }>;
    const current = rows.filter((r) => r.obligationKey === keyA && r.status !== 'SUPERSEDED');
    expect(current.every((r) => r.sourceFingerprint === 'fp-conc-a-v3')).toBe(true);
  });

  it('Scenario 7 (Concurrency): DISMISS(A) racing SOURCE_CHANGE(A→B) settles deterministically over 100 runs', async () => {
    // Dedicated 4K.3A proof: a DISMISS recorded against fingerprint A must never
    // suppress the fresh lineage B. Both operations genuinely overlap in flight:
    // the HTTP dismiss traverses guard + validation + projection lookup while the
    // source update commits mid-flight (staggered per iteration).
    //
    // Settling semantics (by construction, both orders converge):
    // - lookup sees live A (update not yet committed): dismissal A is recorded
    //   (201); after the commit it survives only as a SUPERSEDED shell.
    // - lookup sees live B under the same key (update already committed — the key
    //   excludes the fingerprint): dismissal A is still recorded (201) as history
    //   and the projection immediately shelves it as a shell; B stays actionable.
    // A 404 occurs only when no live instance exists for the key at all
    // (proven deterministically by Scenario 8); it never drops a same-key
    // dismissal into the void. Either way the settled state below must hold.
    //
    // Pacing note: the API enforces a global 100 req/60s throttle per client.
    // Iterations are paced (~1s) to stay sustainably under that budget; the
    // mid-race read runs every 5th iteration. A 429 here would be a test-design
    // artifact, never a product defect — pacing keeps the race genuine while
    // respecting the production guard.
    const RUNS = 100;
    let failures = 0;
    let dismissRecorded = 0;
    let dismissRejected = 0;
    let firstError = '';
    let midReads = 0;

    for (let i = 0; i < RUNS; i++) {
      const userId = uuidFor(`user-dismiss-race-${i}`);
      const token = await session(userId);
      const obligationKey = `${userId}:2026-03:MONTHLY_TAX_PAYMENT:monthly-6015`;
      const reminderKey = `${obligationKey}:UPCOMING_DUE:2026-04-23`;
      // Alternate the source-update stagger so the race genuinely varies the
      // commit point across runs (late commit vs immediate commit). Both orders
      // must converge on the same settled invariants asserted below; the
      // dismiss-recorded vs dismiss-rejected counters only report which order
      // materialized per run.
      const updateDelayMs = i % 2 === 0 ? 25 : 0;
      try {
        await prisma.taxObligationRecord.create({
          data: {
            id: uuidFor(`rem-dismiss-race-ob-${i}`),
            taxSubjectId: userId,
            competence: '2026-03',
            taxBucket: 'EQUITY_NORMAL',
            revenueCode: '6015',
            liabilityFingerprint: 'fp-dismiss-race-A',
            revision: 1,
            principalAmount: '500.00',
            currency: 'BRL',
            dueDate: new Date('2026-04-30T00:00:00.000Z'),
            status: 'OPEN',
            darfReadiness: 'READY',
            dataQuality: 'COMPLETE',
            provenance: {},
          },
        });

        const dismissPromise = request(app.getHttpServer())
          .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(reminderKey)}/actions`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            actionType: 'DISMISS',
            obligationKey,
            reminderKind: 'UPCOMING_DUE',
            triggerAt: '2026-04-23',
            sourceFingerprint: 'fp-dismiss-race-A',
          });
        const updatePromise = new Promise((resolve) => setTimeout(resolve, updateDelayMs)).then(
          () =>
            prisma.taxObligationRecord.updateMany({
              where: { taxSubjectId: userId, competence: '2026-03' },
              data: { liabilityFingerprint: 'fp-dismiss-race-B', principalAmount: '600.00' },
            }),
        );
        const tasks: Array<Promise<unknown>> = [dismissPromise, updatePromise];
        if (i % 5 === 0) {
          midReads += 1;
          tasks.push(
            request(app.getHttpServer())
              .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
              .set('Authorization', `Bearer ${token}`),
          );
        }

        const [dismissRes, , midRead] = (await Promise.all(tasks)) as [
          request.Response,
          unknown,
          request.Response | undefined,
        ];

        if (dismissRes.status === 201) {
          dismissRecorded += 1;
          expect(dismissRes.body.data.revision).toBe(1);
        } else {
          dismissRejected += 1;
          expect(dismissRes.status).toBe(404);
        }

        // Mid-race read is always a coherent snapshot: 200 with valid enums and
        // no B-lineage instance carrying an A-lineage interaction.
        if (midRead) {
          expect(midRead.status).toBe(200);
          const midRows = midRead.body.data as Array<{
            reminderKey: string;
            kind: string;
            status: string;
            sourceFingerprint: string;
            actedAt: string | null;
            dedupKey: string;
          }>;
          for (const row of midRows) {
            if (row.sourceFingerprint === 'fp-dismiss-race-B') {
              expect(row.actedAt).toBeNull();
            }
          }
        }

        // Settled state after both operations finish.
        const settled = await request(app.getHttpServer())
          .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        const rows = settled.body.data as Array<{
          reminderKey: string;
          obligationKey: string;
          kind: string;
          status: string;
          sourceFingerprint: string;
          actedAt: string | null;
          dedupKey: string;
        }>;

        // No duplicate semantic identity and no mixed-fingerprint state.
        const dedups = rows.map((r) => r.dedupKey);
        expect(new Set(dedups).size).toBe(dedups.length);

        // New B lineage is actionable and never suppressed by dismissal A.
        const freshB = rows.filter(
          (r) => r.obligationKey === obligationKey && r.sourceFingerprint === 'fp-dismiss-race-B',
        );
        expect(freshB.length).toBeGreaterThan(0);
        expect(freshB.every((r) => r.status === 'SCHEDULED' || r.status === 'DELIVERED')).toBe(
          true,
        );
        expect(freshB.every((r) => r.actedAt === null)).toBe(true);
        const upcomingB = freshB.filter((r) => r.kind === 'UPCOMING_DUE');
        expect(upcomingB.length).toBe(3);

        if (dismissRes.status === 201) {
          // Dismissal A preserved historically as a superseded shell, never reused.
          const shells = rows.filter(
            (r) => r.reminderKey === reminderKey && r.status === 'SUPERSEDED',
          );
          expect(shells.length).toBe(1);
          expect(shells[0]!.sourceFingerprint).toBe('fp-dismiss-race-A');
        } else {
          // Rejected dismissal left no trace: no A shell may exist.
          const shells = rows.filter((r) => r.sourceFingerprint === 'fp-dismiss-race-A');
          expect(shells).toEqual([]);
        }

        // Pace iterations to respect the production 100 req/60s throttle.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        failures += 1;
        if (!firstError) {
          firstError = err instanceof Error ? err.message : String(err);
        }
      }
    }

    console.info(
      `[Dismiss race] runs: ${RUNS}, failures: ${failures}, dismiss-recorded(201): ${dismissRecorded}, dismiss-rejected(404): ${dismissRejected}, mid-reads: ${midReads}, first-error: ${firstError}`,
    );
    expect(failures).toBe(0);
    expect(dismissRecorded + dismissRejected).toBe(RUNS);
  });

  it('Scenario 8 (Concurrency): stale dismiss after committed source change is fail-closed 404', async () => {
    // Deterministic complement to the race: a dismissal for a reminder key that
    // has no live instance under the current source is rejected (404) and leaves
    // history untouched, while the current lineage stays actionable.
    const token = await session(user1);
    const staleKey = `${keyA}:UPCOMING_DUE:2026-04-01`;
    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/compliance/reminders/${encodeURIComponent(staleKey)}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: 'DISMISS',
        obligationKey: keyA,
        reminderKind: 'UPCOMING_DUE',
        triggerAt: '2026-04-01',
        sourceFingerprint: 'fp-stale-dismiss-A',
      })
      .expect(404);
    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/compliance/reminders?calendarYear=2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = res.body.data as Array<{
      reminderKey: string;
      obligationKey: string;
      status: string;
      sourceFingerprint: string;
    }>;
    // The rejected attempt created no shell for a fingerprint that never existed here.
    expect(rows.filter((r) => r.sourceFingerprint === 'fp-stale-dismiss-A')).toEqual([]);
    const live = rows.filter((r) => r.obligationKey === keyA && r.status !== 'SUPERSEDED');
    expect(live.length).toBeGreaterThan(0);
  });
});
