import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  TaxCarryForwardRepository,
  TaxObligationRepository,
  TaxPaymentAggregationRepository,
} from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const obligations = new TaxObligationRepository(prisma);
const carryForward = new TaxCarryForwardRepository(prisma);
const aggregations = new TaxPaymentAggregationRepository(prisma);

const SUBJECT = 'ee111111-1111-4111-8111-111111111111';
const OTHER = 'ee222222-2222-4222-8222-222222222222';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function user(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
}

async function obligation(taxSubjectId: string, competence: string, amount: string) {
  const { record } = await obligations.materialize({
    taxSubjectId,
    competence,
    taxBucket: 'FII_SALE',
    revenueCode: '6015',
    liabilityFingerprint: `fp-${competence}-${amount}`,
    deadlineEntryId: null,
    principalAmount: amount,
    currency: 'BRL',
    dueDate: d('2099-02-28'),
    status: 'OPEN',
    reasonCode: null,
    darfReadiness: 'READY',
    darfReadinessReason: null,
    dataQuality: 'COMPLETE',
    provenance: {},
  });
  return record;
}

async function entry(sourceObligationId: string, amount: string) {
  return carryForward.createEntry({
    taxSubjectId: SUBJECT,
    sourceObligationId,
    sourceCompetence: '2099-01',
    revenueCode: '6015',
    currency: 'BRL',
    amount,
    targetCompetence: '2099-02',
    ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
    ruleVersion: '1.0.0',
    fingerprint: `cf-${sourceObligationId}-${amount}`,
  });
}

async function aggregation(taxSubjectId: string, fingerprint: string): Promise<string> {
  const { record } = await aggregations.create({
    taxSubjectId,
    revenueCode: '6015',
    targetCompetence: '2099-02',
    currency: 'BRL',
    currentAmount: '6',
    carryForwardAmount: '4',
    totalPayable: '10',
    minimumThreshold: '10',
    sourceEntryIds: [],
    currentObligationId: null,
    dueDate: d('2099-03-31'),
    status: 'PAYABLE',
    ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
    ruleVersion: '1.0.0',
    fingerprint,
  });
  return record.id;
}

describe('Database: Phase 4E carry-forward & payment aggregation', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });
  beforeEach(async () => {
    await cleanDatabase();
    await user(SUBJECT);
    await user(OTHER);
  });
  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('materializes a carry-forward entry idempotently (same source identity)', async () => {
    const obl = await obligation(SUBJECT, '2099-01', '4');
    const first = await entry(obl.id, '4');
    expect(first.outcome).toBe('CREATED');
    const second = await entry(obl.id, '4');
    expect(second.outcome).toBe('DUPLICATE');
    expect(second.record.id).toBe(first.record.id);
    const rows = await carryForward.listBySubject(SUBJECT);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe('4');
    expect(rows[0]!.status).toBe('OPEN');
  });

  it('consumes a carry-forward entry exactly once', async () => {
    const obl = await obligation(SUBJECT, '2099-01', '4');
    const created = await entry(obl.id, '4');
    const agg1 = await aggregation(SUBJECT, 'agg-fp-exact-1');
    const agg2 = await aggregation(SUBJECT, 'agg-fp-exact-2');
    const first = await carryForward.consumeEntries({
      taxSubjectId: SUBJECT,
      entryIds: [created.record.id],
      aggregationId: agg1,
      consumedAt: d('2099-03-01'),
    });
    expect(first.outcome).toBe('CONSUMED');
    expect(first.consumed).toBe(1);

    const second = await carryForward.consumeEntries({
      taxSubjectId: SUBJECT,
      entryIds: [created.record.id],
      aggregationId: agg2,
      consumedAt: d('2099-03-02'),
    });
    expect(second.outcome).toBe('ALREADY_CONSUMED');
    expect(second.consumed).toBe(0);

    const stored = await carryForward.findById(created.record.id, SUBJECT);
    expect(stored!.status).toBe('CONSUMED');
    expect(stored!.consumedByAggregationId).toBe(agg1);
  });

  it('does not consume the same entry twice under concurrency', async () => {
    const oblA = await obligation(SUBJECT, '2099-01', '4');
    const oblB = await obligation(SUBJECT, '2099-01', '5');
    const a = await entry(oblA.id, '4');
    // Force a distinct source identity for the second entry.
    const b = await carryForward.createEntry({
      taxSubjectId: SUBJECT,
      sourceObligationId: oblB.id,
      sourceCompetence: '2099-01',
      revenueCode: '6015',
      currency: 'BRL',
      amount: '5',
      targetCompetence: '2099-02',
      ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
      ruleVersion: '1.0.0',
      fingerprint: 'cf-b',
    });
    const ids = [a.record.id, b.record.id];
    const aggA = await aggregation(SUBJECT, 'agg-fp-conc-a');
    const aggB = await aggregation(SUBJECT, 'agg-fp-conc-b');

    const results = await Promise.all([
      carryForward.consumeEntries({
        taxSubjectId: SUBJECT,
        entryIds: ids,
        aggregationId: aggA,
        consumedAt: d('2099-03-01'),
      }),
      carryForward.consumeEntries({
        taxSubjectId: SUBJECT,
        entryIds: ids,
        aggregationId: aggB,
        consumedAt: d('2099-03-01'),
      }),
    ]);

    const consumed = results.filter((r) => r.outcome === 'CONSUMED');
    const already = results.filter((r) => r.outcome === 'ALREADY_CONSUMED');
    expect(consumed).toHaveLength(1);
    expect(already).toHaveLength(1);

    const stored = await prisma.taxCarryForwardEntry.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    expect(stored.every((row) => row.status === 'CONSUMED')).toBe(true);
    const aggregationIds = new Set(stored.map((row) => row.consumedByAggregationId));
    expect(aggregationIds.size).toBe(1);
  });

  it('creates a payment aggregation idempotently and isolates by tax subject', async () => {
    const obl = await obligation(SUBJECT, '2099-02', '10');
    const input = {
      taxSubjectId: SUBJECT,
      revenueCode: '6015',
      targetCompetence: '2099-02',
      currency: 'BRL',
      currentAmount: '6',
      carryForwardAmount: '4',
      totalPayable: '10',
      minimumThreshold: '10',
      sourceEntryIds: ['c1'],
      currentObligationId: obl.id,
      dueDate: d('2099-03-31'),
      status: 'PAYABLE',
      ruleId: 'BR-FEDERAL-MINIMUM-DARF-10',
      ruleVersion: '1.0.0',
      fingerprint: 'agg-fp-1',
    };
    const first = await aggregations.create(input);
    expect(first.outcome).toBe('CREATED');
    const second = await aggregations.create(input);
    expect(second.outcome).toBe('DUPLICATE');
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.sourceEntryIds).toEqual(['c1']);
    expect(second.record.totalPayable).toBe('10');

    expect(await aggregations.findById(first.record.id, OTHER)).toBeNull();
    expect(await aggregations.findById(first.record.id, SUBJECT)).not.toBeNull();
  });
});
