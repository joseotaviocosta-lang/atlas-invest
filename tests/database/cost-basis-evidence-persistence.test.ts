import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Asset } from '@atlas/domain';
import { computeCostEvidenceFingerprint } from '@atlas/domain';
import {
  cleanDatabase,
  getTestPrismaClient,
  seedBaseFixtures,
  disconnectTestDatabase,
} from './setup';
import {
  CostBasisEvidenceRepository,
  AssetRepository,
} from '../../packages/database/src';

describe('Database Integration: cost-basis evidence revisions (ADR-310)', () => {
  const prisma = getTestPrismaClient();
  const repo = new CostBasisEvidenceRepository(prisma);
  const assetRepo = new AssetRepository(prisma);

  let portfolioId: string;
  let accountId: string;
  let assetId: string;

  const input = () => ({
    portfolioId,
    accountId,
    assetId,
    evidenceType: 'BROKERAGE_NOTE',
    source: 'MANUAL_CONFIRMED',
    quantityCovered: '120',
    unitCost: '8.50',
    totalCost: '1020.00',
    currency: 'BRL',
    acquisitionDate: '2024-12-26',
    status: 'REVIEW_REQUIRED',
    sourceReference: 'XP-NOTA-2024-1234',
    notes: 'Nota de corretagem XP',
    fingerprint: computeCostEvidenceFingerprint({
      portfolioId,
      accountId,
      assetId,
      evidenceType: 'BROKERAGE_NOTE',
      acquisitionDate: '2024-12-26',
      quantityCovered: '120',
      unitCost: '8.50',
      totalCost: '1020.00',
      currency: 'BRL',
      sourceReference: 'XP-NOTA-2024-1234',
      source: 'MANUAL_CONFIRMED',
    }),
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const asset = await assetRepo.create(
      Asset.create({
        ticker: 'KCRE11',
        name: 'Kinea Creditas',
        type: 'FII',
        currency: 'BRL',
        exchange: 'BVMF',
      }),
    );
    assetId = asset.id;
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectTestDatabase();
  });

  it('A. creates v1 and reads it back with exact decimals', async () => {
    const { outcome, record } = await repo.create(input());
    expect(outcome).toBe('CREATED');
    expect(record.version).toBe(1);
    expect(record.supersedesId).toBeNull();
    expect(record.quantityCovered).toBe('120');
    expect(record.unitCost).toBe('8.5');
    expect(record.totalCost).toBe('1020');
    expect(record.acquisitionDate).toBe('2024-12-26');
    expect(record.status).toBe('REVIEW_REQUIRED');
    expect(record.confirmedBy).toBeNull();

    const found = await repo.findById(record.id);
    expect(found?.fingerprint).toBe(record.fingerprint);
  });

  it('B. identical resubmission is idempotent (no new row)', async () => {
    const first = await repo.create(input());
    const second = await repo.create(input());
    expect(second.outcome).toBe('DUPLICATE');
    expect(second.record.id).toBe(first.record.id);
    const rows = await repo.listByScope({ portfolioId, assetId });
    expect(rows).toHaveLength(1);
  });

  it('C. revision inserts v2 linked to v1; current excludes superseded', async () => {
    const first = await repo.create(input());
    const second = await repo.create({
      ...input(),
      quantityCovered: '100',
      totalCost: '850.00',
      fingerprint: computeCostEvidenceFingerprint({
        portfolioId,
        accountId,
        assetId,
        evidenceType: 'BROKERAGE_NOTE',
        acquisitionDate: '2024-12-26',
        quantityCovered: '100',
        unitCost: '8.50',
        totalCost: '850.00',
        currency: 'BRL',
        sourceReference: 'XP-NOTA-2024-1234',
        source: 'MANUAL_CONFIRMED',
      }),
      supersedesId: first.record.id,
    });
    expect(second.outcome).toBe('CREATED');
    expect(second.record.version).toBe(2);
    expect(second.record.supersedesId).toBe(first.record.id);
    const current = await repo.listCurrentByScope({ portfolioId, assetId });
    expect(current.map((r) => r.id)).toEqual([second.record.id]);
    // History preserves both rows (append-only).
    expect(await repo.listByScope({ portfolioId, assetId })).toHaveLength(2);
  });

  it('D. revision of an unknown parent fails closed', async () => {
    await expect(
      repo.create({ ...input(), supersedesId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toThrow(/unknown evidence/);
  });

  it('D2. same-fingerprint transition inserts a new version (submit/verify path)', async () => {
    const first = await repo.create(input());
    // Status transitions reuse the identical semantic fingerprint.
    const second = await repo.create({
      ...input(),
      status: 'VERIFIED',
      supersedesId: first.record.id,
    });
    expect(second.outcome).toBe('CREATED');
    expect(second.record.version).toBe(2);
    expect(second.record.fingerprint).toBe(first.record.fingerprint);
    expect(second.record.status).toBe('VERIFIED');
    expect(await repo.listByScope({ portfolioId, assetId })).toHaveLength(2);
  });

  it('E. scope isolation returns nothing for unrelated portfolios', async () => {
    const { record } = await repo.create(input());
    expect(record.portfolioId).toBe(portfolioId);
    const scoped = await repo.listByScope({ portfolioId: '99999999-9999-4999-8999-999999999999' });
    expect(scoped).toHaveLength(0);
  });
});
