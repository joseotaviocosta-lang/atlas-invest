import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { TaxpayerConfirmationRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const repo = new TaxpayerConfirmationRepository(prisma);

const SUBJECT = 'ee111111-1111-4111-8111-111111111111';
const OTHER = 'ee222222-2222-4222-8222-222222222222';

async function createUser(id: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    await prisma.user.create({
      data: { id, email: `${id}@atlas.dev`, name: 'Tax Subject', passwordHash: 'dummy' },
    });
  }
}

beforeAll(async () => {
  await cleanDatabase();
  await createUser(SUBJECT);
  await createUser(OTHER);
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await prisma.taxpayerConfirmationRecord.deleteMany({});
});

describe('TaxpayerConfirmationRepository — persistence and monotonic revisions (Phase 4H.5)', () => {
  it('A. creates initial confirmation (rev 1) and reads it back', async () => {
    const { outcome, record } = await repo.create({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
      subjectReference: 'asset-petr4',
      decision: 'CONFIRMED',
      statementVersion: '2026.1',
      sourceFingerprint: 'fp_initial_123',
      source: 'MANUAL_TAXPAYER_CONFIRMATION',
      createdByPrincipal: SUBJECT,
      notes: 'Ata de 2025 aprovada',
    });

    expect(outcome).toBe('CREATED');
    expect(record.revision).toBe(1);
    expect(record.supersedesId).toBeNull();
    expect(record.sourceFingerprint).toBe('fp_initial_123');

    const found = await repo.findById(record.id);
    expect(found).not.toBeNull();
    expect(found?.decision).toBe('CONFIRMED');
    expect(found?.notes).toBe('Ata de 2025 aprovada');
  });

  it('B. handles idempotent submissions without incrementing revision', async () => {
    const res1 = await repo.create({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
      subjectReference: 'asset-knri11',
      decision: 'CONFIRMED',
      statementVersion: '2026.1',
      sourceFingerprint: 'fp_knri_123',
      source: 'MANUAL_TAXPAYER_CONFIRMATION',
      createdByPrincipal: SUBJECT,
    });
    expect(res1.outcome).toBe('CREATED');
    expect(res1.record.revision).toBe(1);

    const res2 = await repo.create({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'FII_EXEMPTION_REQUIREMENTS',
      subjectReference: 'asset-knri11',
      decision: 'CONFIRMED',
      statementVersion: '2026.1',
      sourceFingerprint: 'fp_knri_123',
      source: 'MANUAL_TAXPAYER_CONFIRMATION',
      createdByPrincipal: SUBJECT,
    });
    expect(res2.outcome).toBe('IDEMPOTENT');
    expect(res2.record.id).toBe(res1.record.id);
    expect(res2.record.revision).toBe(1);
  });

  it('C. supersedes previous confirmation with incremented revision when content changes', async () => {
    const res1 = await repo.create({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
      subjectReference: 'asset-vale3',
      decision: 'CONFIRMED',
      statementVersion: '2026.1',
      sourceFingerprint: 'fp_vale_v1',
      source: 'MANUAL_TAXPAYER_CONFIRMATION',
      createdByPrincipal: SUBJECT,
    });
    expect(res1.outcome).toBe('CREATED');
    expect(res1.record.revision).toBe(1);

    const res2 = await repo.create({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
      subjectReference: 'asset-vale3',
      decision: 'CONFIRMED',
      statementVersion: '2026.2',
      sourceFingerprint: 'fp_vale_v2',
      source: 'MANUAL_TAXPAYER_CONFIRMATION',
      createdByPrincipal: SUBJECT,
      notes: 'Updated statement version and source fingerprint',
    });
    expect(res2.outcome).toBe('SUPERSEDED');
    expect(res2.record.revision).toBe(2);
    expect(res2.record.supersedesId).toBe(res1.record.id);

    const history = await repo.listHistory({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'DIVIDEND_TRANSITION_EVIDENCE',
      subjectReference: 'asset-vale3',
    });
    expect(history).toHaveLength(2);
    expect(history[0]?.revision).toBe(1);
    expect(history[1]?.revision).toBe(2);
  });

  it('D. maintains subject isolation between users', async () => {
    await repo.create({
      taxSubjectId: SUBJECT,
      calendarYear: 2026,
      confirmationType: 'WITHHOLDING_PROOF',
      subjectReference: 'rep_123',
      decision: 'CONFIRMED',
      statementVersion: '2026.1',
      sourceFingerprint: 'fp_rep',
      source: 'MANUAL_TAXPAYER_CONFIRMATION',
      createdByPrincipal: SUBJECT,
    });

    const otherList = await repo.listByYear({ taxSubjectId: OTHER, calendarYear: 2026 });
    expect(otherList).toHaveLength(0);

    const subjectList = await repo.listByYear({ taxSubjectId: SUBJECT, calendarYear: 2026 });
    expect(subjectList).toHaveLength(1);
  });
});
