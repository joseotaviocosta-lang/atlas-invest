import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';
import { HighIncomeEvidenceRepository } from '@atlas/database';

const prisma = getTestPrismaClient();

const USER_ID = '11111111-1111-4111-8111-111111111111';

async function ensureUser(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: USER_ID } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: 'hi-evidence@atlas.dev',
        name: 'Evidence User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
  }
}

function corporateInput(overrides: Record<string, unknown> = {}) {
  return {
    taxSubjectId: USER_ID,
    calendarYear: 2026,
    payerId: 'PETR4',
    evidenceType: 'CORPORATE_TAX' as const,
    payerType: 'STANDARD_CORPORATE',
    profitPeriodExercise: 2026,
    evidenceMode: 'FULL',
    accountingProfit: '800000.00',
    irDue: '200000.00',
    csllDue: '68000.00',
    authority: 'AUTHORITATIVE' as const,
    evidenceSource: 'PJ_FINANCIAL_STATEMENTS' as const,
    createdByPrincipal: USER_ID,
    ...overrides,
  };
}

describe('Database: high-income evidence persistence (Phase 4I.4)', () => {
  const repo = new HighIncomeEvidenceRepository(prisma);

  beforeAll(async () => {
    await cleanDatabase();
    await ensureUser();
  });

  beforeEach(async () => {
    await prisma.highIncomeEvidenceRecord.deleteMany({});
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectTestDatabase();
  });

  it('creates the first revision and derives payer key + fingerprints', async () => {
    const { outcome, record } = await repo.create(corporateInput());
    expect(outcome).toBe('CREATED');
    expect(record.revision).toBe(1);
    expect(record.payerKey).toBe('PETR4');
    expect(record.supersedesId).toBeNull();
    expect(record.conflictStatus).toBe('NONE');
    expect(record.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(record.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(record.accountingProfit).toBe('800000');
  });

  it('identical resubmission is idempotent (no new revision)', async () => {
    const first = await repo.create(corporateInput());
    const second = await repo.create(corporateInput());
    expect(first.outcome).toBe('CREATED');
    expect(second.outcome).toBe('IDEMPOTENT');
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.revision).toBe(1);
    const history = await repo.listHistory({
      taxSubjectId: USER_ID,
      calendarYear: 2026,
      payerKey: 'PETR4',
      evidenceType: 'CORPORATE_TAX',
      profitPeriodExercise: 2026,
    });
    expect(history).toHaveLength(1);
  });

  it('changed content supersedes with monotonic revision', async () => {
    const first = await repo.create(corporateInput());
    const second = await repo.create(corporateInput({ irDue: '210000.00' }));
    expect(second.outcome).toBe('SUPERSEDED');
    expect(second.record.revision).toBe(2);
    expect(second.record.supersedesId).toBe(first.record.id);
    expect(second.record.sourceFingerprint).not.toBe(first.record.sourceFingerprint);
    const current = await repo.findCurrent({
      taxSubjectId: USER_ID,
      calendarYear: 2026,
      payerKey: 'PETR4',
      evidenceType: 'CORPORATE_TAX',
      profitPeriodExercise: 2026,
    });
    expect(current?.id).toBe(second.record.id);
    expect(current?.irDue).toBe('210000');
  });

  it('authoritative record superseded from another source becomes CONFLICT', async () => {
    await repo.create(corporateInput());
    const { record } = await repo.create(
      corporateInput({ irDue: '210000.00', evidenceSource: 'OFFICIAL_PRE_FILLED' }),
    );
    expect(record.conflictStatus).toBe('CONFLICT');
    expect(record.revision).toBe(2);
  });

  it('same-source revision does not conflict', async () => {
    await repo.create(corporateInput());
    const { record } = await repo.create(corporateInput({ irDue: '210000.00' }));
    expect(record.conflictStatus).toBe('NONE');
  });

  it('resolve ACCEPT_NEW clears conflict with a new revision', async () => {
    await repo.create(corporateInput());
    const conflicted = await repo.create(
      corporateInput({ irDue: '210000.00', evidenceSource: 'OFFICIAL_PRE_FILLED' }),
    );
    expect(conflicted.record.conflictStatus).toBe('CONFLICT');
    const { record } = await repo.resolve({
      id: conflicted.record.id,
      taxSubjectId: USER_ID,
      decision: 'ACCEPT_NEW',
      createdByPrincipal: USER_ID,
    });
    expect(record.revision).toBe(3);
    expect(record.conflictStatus).toBe('NONE');
    expect(record.resolutionNote).toBe('ACCEPT_NEW');
    expect(record.irDue).toBe('210000');
  });

  it('resolve KEEP_EXISTING restores pre-conflict content', async () => {
    await repo.create(corporateInput());
    const conflicted = await repo.create(
      corporateInput({ irDue: '210000.00', evidenceSource: 'OFFICIAL_PRE_FILLED' }),
    );
    const { record } = await repo.resolve({
      id: conflicted.record.id,
      taxSubjectId: USER_ID,
      decision: 'KEEP_EXISTING',
      createdByPrincipal: USER_ID,
    });
    expect(record.revision).toBe(3);
    expect(record.conflictStatus).toBe('NONE');
    expect(record.resolutionNote).toBe('KEEP_EXISTING');
    expect(record.irDue).toBe('200000');
  });

  it('resolve on non-conflicted record fails', async () => {
    const { record } = await repo.create(corporateInput());
    await expect(
      repo.resolve({
        id: record.id,
        taxSubjectId: USER_ID,
        decision: 'ACCEPT_NEW',
        createdByPrincipal: USER_ID,
      }),
    ).rejects.toThrow();
  });

  it('listCurrentBySubjectYear returns latest revision per identity in bulk', async () => {
    await repo.create(corporateInput());
    await repo.create(corporateInput({ irDue: '210000.00' }));
    await repo.create(
      corporateInput({
        payerId: null,
        evidenceType: 'ANNUAL_ADJUSTMENT_IRPF',
        payerType: null,
        profitPeriodExercise: null,
        evidenceMode: null,
        accountingProfit: null,
        irDue: null,
        csllDue: null,
        adjustmentAmount: '15000.00',
      }),
    );
    const rows = await repo.listCurrentBySubjectYear({ taxSubjectId: USER_ID, calendarYear: 2026 });
    expect(rows).toHaveLength(2);
    const corporate = rows.find((row) => row.evidenceType === 'CORPORATE_TAX');
    expect(corporate?.revision).toBe(2);
    expect(corporate?.irDue).toBe('210000');
    const adjustment = rows.find((row) => row.evidenceType === 'ANNUAL_ADJUSTMENT_IRPF');
    expect(adjustment?.payerKey).toBe('_ANNUAL_');
    expect(adjustment?.adjustmentAmount).toBe('15000');
  });

  it('watermark reflects count and max update time', async () => {
    const before = await repo.watermark({ taxSubjectId: USER_ID, calendarYear: 2026 });
    expect(before.count).toBe(0);
    expect(before.maxUpdatedAt).toBeNull();
    await repo.create(corporateInput());
    const after = await repo.watermark({ taxSubjectId: USER_ID, calendarYear: 2026 });
    expect(after.count).toBe(1);
    expect(after.maxUpdatedAt).not.toBeNull();
  });

  it('concurrent identical writes converge to a single revision', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => repo.create(corporateInput())),
    );
    const created = outcomes.filter((o) => o.outcome === 'CREATED');
    const idempotent = outcomes.filter((o) => o.outcome === 'IDEMPOTENT');
    expect(created).toHaveLength(1);
    expect(idempotent).toHaveLength(4);
    const history = await repo.listHistory({
      taxSubjectId: USER_ID,
      calendarYear: 2026,
      payerKey: 'PETR4',
      evidenceType: 'CORPORATE_TAX',
      profitPeriodExercise: 2026,
    });
    expect(history).toHaveLength(1);
  });

  it('records are isolated per subject and year', async () => {
    await repo.create(corporateInput());
    const otherYear = await repo.listCurrentBySubjectYear({
      taxSubjectId: USER_ID,
      calendarYear: 2027,
    });
    expect(otherYear).toHaveLength(0);
    const otherSubject = await repo.listCurrentBySubjectYear({
      taxSubjectId: '22222222-2222-4222-8222-222222222222',
      calendarYear: 2026,
    });
    expect(otherSubject).toHaveLength(0);
  });

  it('different profit periods coexist as separate identities', async () => {
    const first = await repo.create(corporateInput({ profitPeriodExercise: 2025 }));
    const second = await repo.create(corporateInput({ profitPeriodExercise: 2026 }));
    expect(first.record.revision).toBe(1);
    expect(second.record.revision).toBe(1);
    expect(second.outcome).toBe('CREATED');
    const rows = await repo.listCurrentBySubjectYear({ taxSubjectId: USER_ID, calendarYear: 2026 });
    expect(rows).toHaveLength(2);
  });

  it('same profit period revisions chain monotonically', async () => {
    await repo.create(corporateInput({ profitPeriodExercise: 2026 }));
    const second = await repo.create(corporateInput({ profitPeriodExercise: 2026, irDue: '1.00' }));
    expect(second.record.revision).toBe(2);
  });
});
