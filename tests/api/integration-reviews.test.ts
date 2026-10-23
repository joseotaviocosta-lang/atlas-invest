import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5P-B — derived review inbox end-to-end (real DB, real API).
 *
 * Covers derivation rules, severity, resolution semantics (confirm,
 * superseded failures, stale links), ownership isolation, pagination,
 * filters, the pending-count badge feed and the safe response shape.
 * No migration, no external notification, no real B3 calls.
 */
describe('API Integration: review inbox (Phase 5P-B)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function reviewsUrl(query = ''): string {
    return `/api/v1/integration-reviews${query}`;
  }

  async function seedRun(overrides: {
    portfolioId?: string;
    source?: string;
    trigger?: string | null;
    status?: string;
    newCandidates?: number;
    exactDuplicates?: number;
    probableDuplicates?: number;
    conflicts?: number;
    unsupported?: number;
    invalid?: number;
    partial?: boolean;
    reconciliation?: {
      matched: number;
      divergent: number;
      missingLocal: number;
      missingSource: number;
      unresolved: number;
    } | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await prisma.integrationRun.create({
      data: {
        id,
        portfolioId: overrides.portfolioId ?? portfolioId,
        source: overrides.source ?? 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: overrides.status ?? 'AWAITING_REVIEW',
        recordsFetched: 5,
        recordsNormalized: 5,
        newCandidates: overrides.newCandidates ?? 0,
        exactDuplicates: overrides.exactDuplicates ?? 0,
        probableDuplicates: overrides.probableDuplicates ?? 0,
        conflicts: overrides.conflicts ?? 0,
        unsupported: overrides.unsupported ?? 0,
        invalid: overrides.invalid ?? 0,
        confirmed: 0,
        ignored: 0,
        reconciliationMatched: overrides.reconciliation?.matched ?? null,
        reconciliationDivergent: overrides.reconciliation?.divergent ?? null,
        reconciliationMissingLocal: overrides.reconciliation?.missingLocal ?? null,
        reconciliationMissingSource: overrides.reconciliation?.missingSource ?? null,
        reconciliationUnresolved: overrides.reconciliation?.unresolved ?? null,
        partial: overrides.partial ?? false,
        errorCode: overrides.errorCode ?? null,
        errorMessage: overrides.errorMessage ?? null,
        trigger: overrides.trigger ?? 'SCHEDULED',
        createdAt: overrides.createdAt ?? now,
        updatedAt: now,
      },
    });
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
    await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'B3',
      },
    });
  });

  it('awaiting review with new records produces a REVIEW item with a functional action', async () => {
    const runId = await seedRun({ newCandidates: 5, exactDuplicates: 2 });
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      runId,
      portfolioId,
      portfolioName: 'Test Portfolio',
      source: 'B3',
      trigger: 'SCHEDULED',
      severity: 'REVIEW',
      reasonCodes: ['NEW_RECORDS'],
      action: { kind: 'REVIEW_RUN', runId, portfolioId },
    });
    expect(res.body.meta).toMatchObject({ hasMore: false });
  });

  it('clean completed runs, matched-only reconciliations and quiet reviews stay out of the inbox', async () => {
    await seedRun({ status: 'COMPLETED' });
    await seedRun({
      newCandidates: 0,
      exactDuplicates: 9,
      reconciliation: {
        matched: 3,
        divergent: 0,
        missingLocal: 0,
        missingSource: 0,
        unresolved: 0,
      },
    });
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    const count = await request(app.getHttpServer())
      .get(reviewsUrl('/count'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(count.body.data).toMatchObject({ pendingCount: 0, truncated: false });
  });

  it('conflicts warn louder than probable duplicates and sort first', async () => {
    await seedRun({
      newCandidates: 0,
      probableDuplicates: 2,
      createdAt: new Date('2026-10-22T09:00:00Z'),
    });
    await seedRun({ conflicts: 1, createdAt: new Date('2026-10-22T09:00:00Z') });
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(
      res.body.data.map((item: { metrics: { conflicts: number } }) => item.metrics.conflicts),
    ).toEqual([1, 0]);
    expect(res.body.data[0].severity).toBe('WARNING');
    expect(res.body.data[0].reasonCodes).toContain('CONFLICT');
    expect(res.body.data[1].reasonCodes).toEqual(['PROBABLE_DUPLICATE']);
  });

  it('unsupported records, partial syncs and reconciliation gaps warn with stable codes', async () => {
    await seedRun({
      unsupported: 1,
      partial: true,
      reconciliation: {
        matched: 1,
        divergent: 1,
        missingLocal: 2,
        missingSource: 3,
        unresolved: 4,
      },
    });
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].severity).toBe('WARNING');
    expect(res.body.data[0].reasonCodes).toEqual([
      'UNSUPPORTED_RECORD',
      'PARTIAL_SYNC',
      'POSITION_DIVERGENCE',
      'MISSING_LOCAL_POSITION',
      'MISSING_SOURCE_POSITION',
      'UNRESOLVED_POSITION',
    ]);
  });

  it('failed runs surface as errors with safe messages only', async () => {
    const runId = await seedRun({
      status: 'FAILED',
      trigger: 'SCHEDULED',
      errorCode: 'B3_TRANSPORT.UPSTREAM_UNAVAILABLE',
      errorMessage: 'B3 upstream failure',
    });
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      runId,
      severity: 'ERROR',
      reasonCodes: ['SYNC_FAILED'],
      action: { kind: 'VIEW_RUN', runId, portfolioId },
    });
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(
      /stack|traceback|fingerprint|externalId|token|secret|password|certificate/i,
    );
  });

  it('a newer execution supersedes an old failure; detail explains stale links', async () => {
    const failedId = await seedRun({
      status: 'FAILED',
      createdAt: new Date('2026-10-22T08:00:00Z'),
    });
    await seedRun({ status: 'STARTED', createdAt: new Date('2026-10-22T09:00:00Z') });
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.body.data).toHaveLength(0);

    const detail = await request(app.getHttpServer())
      .get(reviewsUrl(`/${failedId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      item: null,
      state: 'RESOLVED',
      resolvedReason: 'SUPERSEDED',
    });
  });

  it('detail resolves actionable, confirmed and quiet runs distinctly', async () => {
    const actionableId = await seedRun({ newCandidates: 3 });
    const actionable = await request(app.getHttpServer())
      .get(reviewsUrl(`/${actionableId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(actionable.status).toBe(200);
    expect(actionable.body.data.state).toBe('ACTIONABLE');
    expect(actionable.body.data.item.runId).toBe(actionableId);

    const confirmedId = await seedRun({ status: 'COMPLETED' });
    const confirmed = await request(app.getHttpServer())
      .get(reviewsUrl(`/${confirmedId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(confirmed.body.data).toMatchObject({
      item: null,
      state: 'RESOLVED',
      resolvedReason: 'CONFIRMED',
    });

    const quietId = await seedRun({ newCandidates: 0, exactDuplicates: 4 });
    const quiet = await request(app.getHttpServer())
      .get(reviewsUrl(`/${quietId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(quiet.body.data).toMatchObject({
      item: null,
      state: 'RESOLVED',
      resolvedReason: 'NO_ACTION',
    });
  });

  it('ownership isolates reviews across users (404, never 403)', async () => {
    const runId = await seedRun({ newCandidates: 2 });
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger@atlas.dev', name: 'Stranger', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'Stranger Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    const otherSession = await createAuthenticatedUserSession(stranger);
    const other = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${otherSession.token}`);
    expect(other.status).toBe(200);
    expect(other.body.data).toHaveLength(0);
    const detail = await request(app.getHttpServer())
      .get(reviewsUrl(`/${runId}`))
      .set('Authorization', `Bearer ${otherSession.token}`);
    expect(detail.status).toBe(404);
    const filtered = await request(app.getHttpServer())
      .get(reviewsUrl(`?portfolioId=${strangerPortfolio}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(filtered.status).toBe(404);
  });

  it('paginates with opaque cursors and filters by severity and portfolio', async () => {
    await seedRun({ newCandidates: 1, createdAt: new Date('2026-10-22T08:00:00Z') });
    await seedRun({ newCandidates: 2, createdAt: new Date('2026-10-22T09:00:00Z') });
    await seedRun({ status: 'FAILED', createdAt: new Date('2026-10-22T10:00:00Z') });
    const first = await request(app.getHttpServer())
      .get(reviewsUrl('?limit=2'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.hasMore).toBe(true);
    expect(first.body.meta.nextCursor).not.toBeNull();
    // Errors first: newest failure occupies the head.
    expect(first.body.data[0].severity).toBe('ERROR');

    const second = await request(app.getHttpServer())
      .get(reviewsUrl(`?limit=2&cursor=${first.body.meta.nextCursor}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.hasMore).toBe(false);

    const forged = await request(app.getHttpServer())
      .get(reviewsUrl(`?cursor=${randomUUID()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(forged.status).toBe(404);

    const errors = await request(app.getHttpServer())
      .get(reviewsUrl('?severity=ERROR'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(errors.body.data).toHaveLength(1);
    expect(errors.body.data[0].severity).toBe('ERROR');

    const scoped = await request(app.getHttpServer())
      .get(reviewsUrl(`?portfolioId=${portfolioId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(scoped.body.data).toHaveLength(3);
  });

  it('csv preview creates an inbox item and confirming it resolves the item', async () => {
    const preview = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/preview`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceType: 'GENERIC_CSV',
        provider: 'XP',
        fileName: 'ops.csv',
        content: [
          'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
          '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-5B-1',
        ].join('\n'),
        defaultAccountId: accountId,
      });
    expect(preview.status).toBe(200);
    const runId = preview.body.data.runId as string;

    const listed = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).toMatchObject({
      runId,
      trigger: 'MANUAL',
      severity: 'REVIEW',
      reasonCodes: ['NEW_RECORDS'],
    });

    const confirm = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/imports/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceType: 'GENERIC_CSV',
        provider: 'XP',
        fileName: 'ops.csv',
        content: [
          'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
          '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-5B-1',
        ].join('\n'),
        defaultAccountId: accountId,
        decisions: [{ rowNumber: 2, action: 'import' }],
        runId,
      });
    expect(confirm.status).toBe(201);

    const after = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(after.body.data).toHaveLength(0);
    const count = await request(app.getHttpServer())
      .get(reviewsUrl('/count'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(count.body.data.pendingCount).toBe(0);
    const detail = await request(app.getHttpServer())
      .get(reviewsUrl(`/${runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data).toMatchObject({
      item: null,
      state: 'RESOLVED',
      resolvedReason: 'CONFIRMED',
    });
  });

  it('returns an explicit empty inbox for fresh portfolios', async () => {
    const res = await request(app.getHttpServer())
      .get(reviewsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
  });
});
