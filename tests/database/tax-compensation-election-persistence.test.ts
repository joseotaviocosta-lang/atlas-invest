import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { TaxCompensationElectionRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const elections = new TaxCompensationElectionRepository(prisma);

const SUBJECT = 'ee111111-1111-4111-8111-111111111111';
const OTHER = 'ee222222-2222-4222-8222-222222222222';
const ELECTION_TYPE = 'EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION';
const SOURCE = 'MANUAL_CONFIRMED';
const DECLARE = 'DECLARE_FOR_CARRYFORWARD';
const DECLINE = 'DO_NOT_DECLARE';

async function user(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
}

function put(taxSubjectId: string, competence: string, value: string) {
  return elections.putRevision({
    taxSubjectId,
    competence,
    electionType: ELECTION_TYPE,
    value,
    source: SOURCE,
  });
}

function current(taxSubjectId: string, competence: string) {
  return elections.findCurrent({ taxSubjectId, competence, electionType: ELECTION_TYPE });
}

function history(taxSubjectId: string, competence: string) {
  return elections.listHistory({ taxSubjectId, competence, electionType: ELECTION_TYPE });
}

beforeAll(async () => {
  await cleanDatabase();
  await user(SUBJECT);
  await user(OTHER);
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await prisma.taxCompensationElectionRecord.deleteMany({});
});

describe('TaxCompensationElectionRepository — immutable revisions', () => {
  it('A. creates v1 and reads it back', async () => {
    const { outcome, record } = await put(SUBJECT, '2026-08', DECLARE);
    expect(outcome).toBe('CREATED');
    expect(record.version).toBe(1);
    expect(record.value).toBe(DECLARE);
    expect(record.supersedesId).toBeNull();
    expect(record.source).toBe(SOURCE);
    expect(record.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const cur = await current(SUBJECT, '2026-08');
    expect(cur?.version).toBe(1);
    expect(cur?.value).toBe(DECLARE);
    expect(await history(SUBJECT, '2026-08')).toHaveLength(1);
  });

  it('B. same value is idempotent (no new revision)', async () => {
    await put(SUBJECT, '2026-08', DECLARE);
    const { outcome, record } = await put(SUBJECT, '2026-08', DECLARE);
    expect(outcome).toBe('DUPLICATE');
    expect(record.version).toBe(1);
    expect(await history(SUBJECT, '2026-08')).toHaveLength(1);
  });

  it('C. changed value creates v2 superseding v1', async () => {
    const first = await put(SUBJECT, '2026-08', DECLARE);
    const second = await put(SUBJECT, '2026-08', DECLINE);
    expect(second.outcome).toBe('CREATED');
    expect(second.record.version).toBe(2);
    expect(second.record.supersedesId).toBe(first.record.id);
    const rows = await history(SUBJECT, '2026-08');
    expect(rows.map((r) => [r.version, r.value])).toEqual([
      [1, DECLARE],
      [2, DECLINE],
    ]);
    expect((await current(SUBJECT, '2026-08'))?.version).toBe(2);
  });

  it('D. changing back creates v3 with full immutable history', async () => {
    await put(SUBJECT, '2026-08', DECLARE);
    await put(SUBJECT, '2026-08', DECLINE);
    const third = await put(SUBJECT, '2026-08', DECLARE);
    expect(third.record.version).toBe(3);
    const rows = await history(SUBJECT, '2026-08');
    expect(rows.map((r) => [r.version, r.value])).toEqual([
      [1, DECLARE],
      [2, DECLINE],
      [3, DECLARE],
    ]);
    expect((await current(SUBJECT, '2026-08'))?.version).toBe(3);
  });

  it('isolates competence', async () => {
    await put(SUBJECT, '2026-08', DECLARE);
    const sept = await put(SUBJECT, '2026-09', DECLINE);
    expect(sept.record.version).toBe(1);
    expect((await current(SUBJECT, '2026-08'))?.value).toBe(DECLARE);
    expect((await current(SUBJECT, '2026-09'))?.value).toBe(DECLINE);
  });

  it('isolates tax subject', async () => {
    await put(SUBJECT, '2026-08', DECLARE);
    const other = await put(OTHER, '2026-08', DECLINE);
    expect(other.record.version).toBe(1);
    expect((await current(SUBJECT, '2026-08'))?.value).toBe(DECLARE);
    expect((await current(OTHER, '2026-08'))?.value).toBe(DECLINE);
  });

  it('fingerprint is deterministic and timestamp-independent', async () => {
    const a = await put(SUBJECT, '2026-08', DECLARE);
    await prisma.taxCompensationElectionRecord.deleteMany({});
    const b = await put(SUBJECT, '2026-08', DECLARE);
    // Same semantic revision input → same fingerprint, despite different id/createdAt.
    expect(b.record.fingerprint).toBe(a.record.fingerprint);
    expect(b.record.id).not.toBe(a.record.id);
  });

  it('repeated same-value writes never grow history', async () => {
    for (let i = 0; i < 5; i += 1) {
      await put(SUBJECT, '2026-08', DECLARE);
    }
    expect(await history(SUBJECT, '2026-08')).toHaveLength(1);
  });

  it('alternating values increment version only on semantic change', async () => {
    const seq = [DECLARE, DECLARE, DECLINE, DECLINE, DECLARE];
    for (const value of seq) await put(SUBJECT, '2026-08', value);
    const rows = await history(SUBJECT, '2026-08');
    expect(rows.map((r) => r.value)).toEqual([DECLARE, DECLINE, DECLARE]);
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
  });

  it('concurrent identical writes yield exactly one semantic revision', async () => {
    await Promise.all(Array.from({ length: 5 }, () => put(SUBJECT, '2026-08', DECLARE)));
    const rows = await history(SUBJECT, '2026-08');
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(1);
  });

  it('concurrent conflicting writes keep monotonic, duplicate-free versions', async () => {
    await Promise.all([put(SUBJECT, '2026-08', DECLARE), put(SUBJECT, '2026-08', DECLINE)]);
    const rows = await history(SUBJECT, '2026-08');
    const versions = rows.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((x, y) => x - y));
    expect((await current(SUBJECT, '2026-08'))?.version).toBe(versions[versions.length - 1]);
  });

  it('fails closed on a malformed persisted row', async () => {
    await prisma.taxCompensationElectionRecord.create({
      data: {
        taxSubjectId: SUBJECT,
        competence: '2026-08',
        electionType: ELECTION_TYPE,
        value: 'TOTALLY_UNKNOWN',
        version: 1,
        source: SOURCE,
        supersedesId: null,
        fingerprint: 'x'.repeat(64),
      },
    });
    await expect(current(SUBJECT, '2026-08')).rejects.toThrow();
  });
});
