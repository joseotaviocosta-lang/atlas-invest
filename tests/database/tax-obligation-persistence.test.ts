import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  FederalTaxDeadlineRepository,
  TaxObligationRepository,
  TaxPaymentEvidenceRepository,
} from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const deadlines = new FederalTaxDeadlineRepository(prisma);
const obligations = new TaxObligationRepository(prisma);
const payments = new TaxPaymentEvidenceRepository(prisma);

const SUBJECT = 'dd222222-2222-4222-8222-222222222222';
const TEST_COMPETENCE = '2099-01';
const TEST_REVENUE = '6015';

async function user(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
}

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('Database: Phase 4C.2 deadline registry, obligations & payments', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });
  beforeEach(async () => {
    await cleanDatabase();
    await user(SUBJECT);
  });
  afterEach(async () => {
    // Deadline entries are reference data not truncated by cleanDatabase.
    await prisma.federalTaxDeadlineEntry.deleteMany({
      where: { competence: TEST_COMPETENCE },
    });
  });
  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('seeds the real production deadline entry (6015 / 2026-08 / 2026-09-30)', async () => {
    const rows = await deadlines.listByRevenueCodeAndCompetence('6015', '2026-08');
    const verified = rows.find((r) => r.status === 'VERIFIED');
    expect(verified).toBeDefined();
    expect(verified!.dueDate.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(verified!.sourceDocument).toContain('ADE CORAT');
  });

  it('is immutable/versioned: duplicate version is idempotent, second VERIFIED conflicts', async () => {
    const first = await deadlines.createEntry({
      revenueCode: TEST_REVENUE,
      taxBucket: 'FII_SALE',
      competence: TEST_COMPETENCE,
      dueDate: d('2099-02-28'),
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'TEST ADE',
      sourceReference: 'https://example.test',
      sourcePublishedAt: d('2099-01-10'),
      verifiedAt: d('2099-01-11'),
      version: 1,
      supersedesEntryId: null,
    });
    expect(first.outcome).toBe('CREATED');

    const duplicate = await deadlines.createEntry({
      revenueCode: TEST_REVENUE,
      taxBucket: 'FII_SALE',
      competence: TEST_COMPETENCE,
      dueDate: d('2099-02-28'),
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'TEST ADE',
      sourceReference: 'https://example.test',
      sourcePublishedAt: d('2099-01-10'),
      verifiedAt: d('2099-01-11'),
      version: 1,
      supersedesEntryId: null,
    });
    expect(duplicate.outcome).toBe('DUPLICATE');

    const conflicting = await deadlines.createEntry({
      revenueCode: TEST_REVENUE,
      taxBucket: 'FII_SALE',
      competence: TEST_COMPETENCE,
      dueDate: d('2099-02-28'),
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'TEST ADE v2',
      sourceReference: 'https://example.test',
      sourcePublishedAt: d('2099-01-10'),
      verifiedAt: d('2099-01-11'),
      version: 2,
      supersedesEntryId: null,
    });
    expect(conflicting.outcome).toBe('CONFLICT');
  });

  it('supersedes a previous version without overwriting history', async () => {
    const v1 = await deadlines.createEntry({
      revenueCode: TEST_REVENUE,
      taxBucket: 'FII_SALE',
      competence: TEST_COMPETENCE,
      dueDate: d('2099-02-28'),
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'TEST ADE v1',
      sourceReference: 'https://example.test',
      sourcePublishedAt: d('2099-01-10'),
      verifiedAt: d('2099-01-11'),
      version: 1,
      supersedesEntryId: null,
    });
    const superseded = await deadlines.markSuperseded(v1.record.id, 'new-entry-id');
    expect(superseded!.status).toBe('SUPERSEDED');
    const v2 = await deadlines.createEntry({
      revenueCode: TEST_REVENUE,
      taxBucket: 'FII_SALE',
      competence: TEST_COMPETENCE,
      dueDate: d('2099-03-02'),
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'TEST ADE v2',
      sourceReference: 'https://example.test',
      sourcePublishedAt: d('2099-01-10'),
      verifiedAt: d('2099-01-11'),
      version: 2,
      supersedesEntryId: v1.record.id,
    });
    expect(v2.outcome).toBe('CREATED');
    const rows = await deadlines.listByRevenueCodeAndCompetence(TEST_REVENUE, TEST_COMPETENCE);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.version === 1)!.status).toBe('SUPERSEDED');
    expect(rows.find((r) => r.version === 2)!.status).toBe('VERIFIED');
  });

  it('materializes an obligation idempotently and preserves exact decimals', async () => {
    const input = {
      taxSubjectId: SUBJECT,
      competence: '2026-08',
      taxBucket: 'FII_SALE',
      revenueCode: '6015',
      liabilityFingerprint: 'a'.repeat(64),
      deadlineEntryId: null,
      principalAmount: '199.900000000000000001',
      currency: 'BRL',
      dueDate: d('2026-09-30'),
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      darfReadinessReason: null,
      dataQuality: 'COMPLETE',
      provenance: { sourceStrategy: 'DIRECT_OFFICIAL_DEADLINE' },
    };
    const created = await obligations.materialize(input);
    expect(created.outcome).toBe('CREATED');
    expect(created.record.principalAmount).toBe('199.900000000000000001');

    const duplicate = await obligations.materialize(input);
    expect(duplicate.outcome).toBe('DUPLICATE');
    expect(duplicate.record.id).toBe(created.record.id);

    const changed = await obligations.materialize({ ...input, principalAmount: '200' });
    expect(changed.outcome).toBe('SUPERSEDED');
    expect(changed.record.revision).toBe(2);
    const previous = await obligations.findById(created.record.id, SUBJECT);
    expect(previous!.status).toBe('SUPERSEDED');
    expect(previous!.supersededById).toBe(changed.record.id);
  });

  it('records manual payment evidence idempotently and rejects conflicting sources', async () => {
    const { record } = await obligations.materialize({
      taxSubjectId: SUBJECT,
      competence: '2026-08',
      taxBucket: 'FII_SALE',
      revenueCode: '6015',
      liabilityFingerprint: 'b'.repeat(64),
      deadlineEntryId: null,
      principalAmount: '199.9',
      currency: 'BRL',
      dueDate: d('2026-09-30'),
      status: 'OPEN',
      reasonCode: null,
      darfReadiness: 'READY',
      darfReadinessReason: null,
      dataQuality: 'COMPLETE',
      provenance: {},
    });
    const base = {
      obligationId: record.id,
      taxSubjectId: SUBJECT,
      paidAt: d('2026-09-30'),
      amount: '199.9',
      currency: 'BRL',
      sourceType: 'MANUAL_CONFIRMED',
      sourceReference: 'manual-1',
      confirmedAt: d('2026-10-01'),
      status: 'CONFIRMED',
      fingerprint: 'c'.repeat(64),
    };
    const created = await payments.record(base);
    expect(created.outcome).toBe('CREATED');
    expect(created.record.amount).toBe('199.9');

    const duplicate = await payments.record(base);
    expect(duplicate.outcome).toBe('DUPLICATE');

    const conflict = await payments.record({ ...base, amount: '100', fingerprint: 'd'.repeat(64) });
    expect(conflict.outcome).toBe('CONFLICT');
    const list = await payments.listByObligation(record.id, SUBJECT);
    expect(list).toHaveLength(1);
  });

  it('lists obligations at scale (12/60/120/1000) with a single bounded query', async () => {
    for (const size of [12, 60, 120, 1000]) {
      await prisma.taxObligationRecord.deleteMany({ where: { taxSubjectId: SUBJECT } });
      await prisma.taxObligationRecord.createMany({
        data: Array.from({ length: size }, (_, i) => ({
          taxSubjectId: SUBJECT,
          competence: '2026-08',
          taxBucket: 'FII_SALE',
          revenueCode: '6015',
          liabilityFingerprint: String(i).padStart(64, '0'),
          revision: 1,
          status: 'OPEN',
          darfReadiness: 'READY',
          dataQuality: 'COMPLETE',
          provenance: {},
        })),
      });
      const started = Date.now();
      const rows = await obligations.list(SUBJECT, { competence: '2026-08' });
      expect(rows).toHaveLength(size);
      expect(Date.now() - started).toBeLessThan(5000);
    }
  });
});
