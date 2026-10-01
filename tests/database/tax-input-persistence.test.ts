import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { TaxInputRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const repo = new TaxInputRepository(prisma);

async function user(id: string) {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: `${id}@atlas.dev`, name: 'T', passwordHash: 'x' },
    update: {},
  });
}

describe('Database: canonical tax input persistence (Phase 4B.3)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });
  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('is idempotent on the exact same source identity (sequential duplicate)', async () => {
    const subject = 'dd111111-1111-4111-8111-111111111111';
    await user(subject);
    const input = {
      taxSubjectId: subject,
      competence: '2026-09',
      economicDate: new Date('2026-09-10T00:00:00.000Z'),
      category: 'BRAZILIAN_EQUITY',
      amount: '10.00',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'src-1',
      fingerprint: 'fp-1',
      provenance: { source: 'MANUAL' },
    };
    const first = await repo.upsertWithholding(input);
    const second = await repo.upsertWithholding(input);
    expect(first.outcome).toBe('CREATED');
    expect(second.outcome).toBe('DUPLICATE');
    expect(await prisma.taxWithholdingInputRecord.count({ where: { taxSubjectId: subject } })).toBe(
      1,
    );
  });

  it('is DB-safe under concurrent identical creates (unique barrier)', async () => {
    const subject = 'dd222222-2222-4222-8222-222222222222';
    await user(subject);
    const base = {
      taxSubjectId: subject,
      competence: '2026-09',
      economicDate: new Date('2026-09-10T00:00:00.000Z'),
      category: 'BRAZILIAN_EQUITY',
      amount: '5.00',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'BROKER_IMPORT',
      sourceReference: 'conc-1',
      fingerprint: 'fp-conc',
      provenance: { source: 'BROKER_IMPORT' },
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => repo.upsertWithholding(base)),
    );
    expect(results.every((r) => r.outcome === 'CREATED' || r.outcome === 'DUPLICATE')).toBe(true);
    expect(results.filter((r) => r.outcome === 'CREATED').length).toBe(1);
    expect(await prisma.taxWithholdingInputRecord.count({ where: { taxSubjectId: subject } })).toBe(
      1,
    );
  });

  it('flags conflict on same identity with a different value (no overwrite)', async () => {
    const subject = 'dd333333-3333-4333-8333-333333333333';
    await user(subject);
    const base = {
      taxSubjectId: subject,
      competence: '2026-09',
      economicDate: new Date('2026-09-10T00:00:00.000Z'),
      category: 'BRAZILIAN_EQUITY',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'conf-1',
      provenance: { source: 'MANUAL' },
    };
    await repo.upsertWithholding({ ...base, amount: '10.00', fingerprint: 'fp-a' });
    const conflicted = await repo.upsertWithholding({
      ...base,
      amount: '99.00',
      fingerprint: 'fp-b',
    });
    expect(conflicted.outcome).toBe('CONFLICT');
    const rows = await repo.listWithholdings(subject, '2026-09');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe('10');
    expect(rows[0]!.conflictStatus).toBe('CONFLICT');
  });

  it('preserves exact decimal precision through persistence', async () => {
    const subject = 'dd444444-4444-4444-8444-444444444444';
    await user(subject);
    await repo.upsertWithholding({
      taxSubjectId: subject,
      competence: '2026-09',
      economicDate: new Date('2026-09-10T00:00:00.000Z'),
      category: 'BRAZILIAN_EQUITY',
      amount: '12345.678901234567890123',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'prec-1',
      fingerprint: 'fp-prec',
      provenance: {},
    });
    const rows = await repo.listWithholdings(subject, '2026-09');
    expect(rows[0]!.amount).toBe('12345.678901234567890123');
  });

  it('resolves FII facts by as-of date without future leakage', async () => {
    const subject = 'dd555555-5555-4555-8555-555555555555';
    await user(subject);
    const asset = await prisma.asset.create({
      data: { ticker: 'MXRF11', name: 'FII', type: 'FII', currency: 'BRL', exchange: 'B3' },
    });
    const base = {
      taxSubjectId: subject,
      assetId: asset.id,
      holderCount: 500,
      investorOwnershipPercent: '3.999999999999999999',
      isExchangeTraded: true,
      sourceType: 'OFFICIAL_FUND_DATA',
      sourceReference: 'fund-1',
      status: 'KNOWN',
      provenance: {},
    };
    await repo.upsertFiiEligibility({
      ...base,
      asOfDate: new Date('2026-01-01T00:00:00.000Z'),
      fingerprint: 'f1',
    });
    await repo.upsertFiiEligibility({
      ...base,
      holderCount: 900,
      asOfDate: new Date('2026-06-01T00:00:00.000Z'),
      fingerprint: 'f2',
    });

    const march = await repo.listFiiEligibility(
      subject,
      [asset.id],
      new Date('2026-03-01T00:00:00.000Z'),
    );
    expect(march).toHaveLength(1);
    expect(march[0]!.holderCount).toBe(500);
    expect(march[0]!.investorOwnershipPercent).toBe('3.999999999999999999');

    const july = await repo.listFiiEligibility(
      subject,
      [asset.id],
      new Date('2026-07-01T00:00:00.000Z'),
    );
    expect(july[0]!.holderCount).toBe(900);
  });

  it('isolates persisted inputs by tax subject', async () => {
    const a = 'dd666666-6666-4666-8666-666666666666';
    const b = 'dd777777-7777-4777-8777-777777777777';
    await user(a);
    await user(b);
    await repo.upsertWithholding({
      taxSubjectId: a,
      competence: '2026-09',
      economicDate: new Date('2026-09-10T00:00:00.000Z'),
      category: 'BRAZILIAN_EQUITY',
      amount: '1.00',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'a-1',
      fingerprint: 'a',
      provenance: {},
    });
    expect(await repo.listWithholdings(a, '2026-09')).toHaveLength(1);
    expect(await repo.listWithholdings(b, '2026-09')).toHaveLength(0);
  });

  it('retrieves persisted inputs at 10 / 100 / 1000 / 10000 in bounded time', async () => {
    const subject = 'dd888888-8888-4888-8888-888888888888';
    await user(subject);
    for (const n of [10, 100, 1000, 10000]) {
      await prisma.taxWithholdingInputRecord.deleteMany({ where: { taxSubjectId: subject } });
      await prisma.taxWithholdingInputRecord.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          taxSubjectId: subject,
          competence: '2026-09',
          economicDate: new Date('2026-09-10T00:00:00.000Z'),
          category: 'BRAZILIAN_EQUITY',
          amount: new Prisma.Decimal('1.00'),
          currency: 'BRL',
          status: 'CONFIRMED',
          sourceType: 'MANUAL',
          sourceReference: `s-${i}`,
          fingerprint: `f-${i}`,
          provenance: {},
        })),
      });
      const start = Date.now();
      const rows = await repo.listWithholdings(subject, '2026-09');
      const elapsed = Date.now() - start;
      expect(rows).toHaveLength(n);
      expect(elapsed).toBeLessThan(5000);
    }
  }, 60000);
});
