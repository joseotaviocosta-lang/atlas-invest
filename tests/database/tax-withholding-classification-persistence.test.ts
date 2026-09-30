import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { TaxInputRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const repository = new TaxInputRepository(prisma);

const SUBJECT = 'ff111111-1111-4111-8111-111111111111';

async function user(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
}

function upsert(overrides: {
  withholdingCategory: string | null;
  sourceReference: string;
  category?: string;
  fingerprint?: string;
}) {
  return repository.upsertWithholding({
    taxSubjectId: SUBJECT,
    competence: '2026-08',
    economicDate: new Date('2026-08-15T00:00:00.000Z'),
    category: overrides.category ?? 'BRAZILIAN_EQUITY',
    withholdingCategory: overrides.withholdingCategory,
    amount: '3',
    currency: 'BRL',
    status: 'CONFIRMED',
    sourceType: 'MANUAL',
    sourceReference: overrides.sourceReference,
    fingerprint: overrides.fingerprint ?? `fp-${overrides.sourceReference}`,
    provenance: { source: 'MANUAL', sourceReference: overrides.sourceReference },
  });
}

beforeAll(async () => {
  await cleanDatabase();
  await user(SUBJECT);
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await prisma.taxWithholdingInputRecord.deleteMany({});
});

describe('Phase 4G.2B.0 — withholding classification persistence', () => {
  it('A. persists and reads back EQUITY_NORMAL', async () => {
    const { outcome, record } = await upsert({
      withholdingCategory: 'EQUITY_NORMAL',
      sourceReference: 'normal-1',
    });
    expect(outcome).toBe('CREATED');
    expect(record.withholdingCategory).toBe('EQUITY_NORMAL');
    const read = await repository.listWithholdings(SUBJECT, '2026-08');
    expect(read[0]!.withholdingCategory).toBe('EQUITY_NORMAL');
  });

  it('B. persists and reads back EQUITY_DAY_TRADE', async () => {
    const { record } = await upsert({
      withholdingCategory: 'EQUITY_DAY_TRADE',
      sourceReference: 'day-1',
    });
    expect(record.withholdingCategory).toBe('EQUITY_DAY_TRADE');
  });

  it('E. legacy null discriminator remains readable and is not classified', async () => {
    await prisma.taxWithholdingInputRecord.create({
      data: {
        taxSubjectId: SUBJECT,
        competence: '2026-08',
        economicDate: new Date('2026-08-15T00:00:00.000Z'),
        category: 'BRAZILIAN_EQUITY',
        withholdingCategory: null,
        amount: null,
        currency: 'BRL',
        status: 'UNKNOWN',
        sourceType: 'MANUAL',
        sourceReference: 'legacy-1',
        fingerprint: 'legacy-fp',
        provenance: {},
      },
    });
    const read = await repository.listWithholdings(SUBJECT, '2026-08');
    const legacy = read.find((r) => r.sourceReference === 'legacy-1')!;
    expect(legacy.withholdingCategory).toBeNull();
  });

  it('F. FII rows persist without an equity discriminator', async () => {
    const { record } = await upsert({
      withholdingCategory: null,
      sourceReference: 'fii-1',
      category: 'FII',
    });
    expect(record.category).toBe('FII');
    expect(record.withholdingCategory).toBeNull();
  });

  it('G/H. different discriminator on the same identity is an explicit conflict', async () => {
    await upsert({
      withholdingCategory: 'EQUITY_NORMAL',
      sourceReference: 'same-1',
      fingerprint: 'fp-n',
    });
    const second = await upsert({
      withholdingCategory: 'EQUITY_DAY_TRADE',
      sourceReference: 'same-1',
      fingerprint: 'fp-d',
    });
    expect(second.outcome).toBe('CONFLICT');
    const rows = await prisma.taxWithholdingInputRecord.findMany({
      where: { taxSubjectId: SUBJECT },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.withholdingCategory).toBe('EQUITY_NORMAL');
  });

  it('idempotent same semantic input does not duplicate', async () => {
    await upsert({
      withholdingCategory: 'EQUITY_NORMAL',
      sourceReference: 'idem-1',
      fingerprint: 'fp-x',
    });
    const again = await upsert({
      withholdingCategory: 'EQUITY_NORMAL',
      sourceReference: 'idem-1',
      fingerprint: 'fp-x',
    });
    expect(again.outcome).toBe('DUPLICATE');
    expect(await prisma.taxWithholdingInputRecord.count()).toBe(1);
  });
});
