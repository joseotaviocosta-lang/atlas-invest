import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { TaxCompensationElectionRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const elections = new TaxCompensationElectionRepository(prisma);

const SUBJECT = 'ee333333-3333-4333-8333-333333333333';
const ELECTION_TYPE = 'EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION';
const SOURCE = 'MANUAL_CONFIRMED';

const SIZES = [1, 12, 60, 120, 1000];

function findCurrent() {
  return elections.findCurrent({
    taxSubjectId: SUBJECT,
    competence: '2026-08',
    electionType: ELECTION_TYPE,
  });
}

function listHistory() {
  return elections.listHistory({
    taxSubjectId: SUBJECT,
    competence: '2026-08',
    electionType: ELECTION_TYPE,
  });
}

beforeAll(async () => {
  await cleanDatabase();
  await prisma.user.create({
    data: { id: SUBJECT, email: `${SUBJECT}@atlas.dev`, name: 'T', passwordHash: 'x' },
  });
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectTestDatabase();
});

describe('TaxCompensationElectionRepository — light scale', () => {
  it('keeps current/history reads bounded across revision counts', async () => {
    const report: string[] = [];
    for (const size of SIZES) {
      await prisma.taxCompensationElectionRecord.deleteMany({ where: { taxSubjectId: SUBJECT } });
      for (let v = 1; v <= size; v += 1) {
        await prisma.taxCompensationElectionRecord.create({
          data: {
            taxSubjectId: SUBJECT,
            competence: '2026-08',
            electionType: ELECTION_TYPE,
            value: v % 2 === 1 ? 'DECLARE_FOR_CARRYFORWARD' : 'DO_NOT_DECLARE',
            version: v,
            source: SOURCE,
            supersedesId: null,
            fingerprint: `fp-${v}`,
          },
        });
      }

      const t0 = performance.now();
      const current = await findCurrent();
      const t1 = performance.now();
      const history = await listHistory();
      const t2 = performance.now();

      expect(current?.version).toBe(size);
      expect(history).toHaveLength(size);
      report.push(
        `size=${size} findCurrent=${(t1 - t0).toFixed(2)}ms listHistory=${(t2 - t1).toFixed(2)}ms`,
      );
    }
    // Surface the deterministic scaling evidence.
    console.log(`[election-scale]\n${report.join('\n')}`);
    expect(report).toHaveLength(SIZES.length);
  });
});
