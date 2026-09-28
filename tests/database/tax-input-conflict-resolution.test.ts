import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { TaxInputRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const repo = new TaxInputRepository(prisma);

async function user(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
}

function withholdingInput(subject: string, amount: string, fingerprint: string) {
  return {
    taxSubjectId: subject,
    competence: '2026-09',
    economicDate: new Date('2026-09-10T00:00:00.000Z'),
    category: 'BRAZILIAN_EQUITY',
    amount,
    currency: 'BRL',
    status: 'CONFIRMED',
    sourceType: 'MANUAL',
    sourceReference: 'src-1',
    fingerprint,
    provenance: { source: 'MANUAL' },
  };
}

describe('Database: tax input conflict resolution (Phase 4B.4)', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });
  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('KEEP_EXISTING clears the conflict and retains the original value', async () => {
    const subject = 'ee111111-1111-4111-8111-111111111111';
    await user(subject);
    const created = await repo.upsertWithholding(withholdingInput(subject, '10', 'fp-a'));
    await repo.upsertWithholding(withholdingInput(subject, '99', 'fp-b')); // conflict
    const resolved = await repo.resolveWithholding(created.record.id, {
      action: 'KEEP_EXISTING',
      resolutionSource: 'USER',
      taxSubjectId: subject,
    });
    expect(resolved!.conflictStatus).toBe('RESOLVED');
    expect(resolved!.amount).toBe('10');
    expect(resolved!.provenance.conflictingCandidate).toBeDefined();
  });

  it('ACCEPT_NEW applies the candidate and keeps the previous value in history', async () => {
    const subject = 'ee222222-2222-4222-8222-222222222222';
    await user(subject);
    const created = await repo.upsertWithholding(withholdingInput(subject, '10', 'fp-a'));
    await repo.upsertWithholding(withholdingInput(subject, '99', 'fp-b'));
    const resolved = await repo.resolveWithholding(created.record.id, {
      action: 'ACCEPT_NEW',
      resolutionSource: 'USER',
      taxSubjectId: subject,
    });
    expect(resolved!.conflictStatus).toBe('RESOLVED');
    expect(resolved!.amount).toBe('99');
    expect(Array.isArray(resolved!.provenance.history)).toBe(true);
    expect((resolved!.provenance.history as unknown[]).length).toBe(1);
  });

  it('does not resolve another subject’s record (anti-enumeration)', async () => {
    const a = 'ee333333-3333-4333-8333-333333333333';
    const b = 'ee444444-4444-4444-8444-444444444444';
    await user(a);
    await user(b);
    const created = await repo.upsertWithholding(withholdingInput(a, '10', 'fp-a'));
    const resolved = await repo.resolveWithholding(created.record.id, {
      action: 'KEEP_EXISTING',
      resolutionSource: 'USER',
      taxSubjectId: b,
    });
    expect(resolved).toBeNull();
  });
});
