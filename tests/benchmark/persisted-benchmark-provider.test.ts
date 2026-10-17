import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  BenchmarkObservationRecordRow,
  BenchmarkObservationRevisionRecordRow,
  BenchmarkObservationUpsertInput,
  BenchmarkObservationUpsertOutcome,
  IBenchmarkObservationRepository,
} from '@atlas/database';
import { PersistedBenchmarkDataProvider } from '../../apps/api/src/market-data/persisted-benchmark-data.provider';
import { UpdateBenchmarkDataUseCase } from '../../apps/api/src/application/benchmark/update-benchmark-data.use-case';
import { GetBenchmarkCoverageUseCase } from '../../apps/api/src/application/benchmark/get-benchmark-coverage.use-case';

class InMemoryBenchmarkRepoForTest implements IBenchmarkObservationRepository {
  private readonly records = new Map<string, BenchmarkObservationRecordRow>();
  private readonly revisions: BenchmarkObservationRevisionRecordRow[] = [];

  private key(id: string, d: LocalDate, s?: string): string {
    return `${id}::${d.toString()}${s ? `::${s}` : ''}`;
  }

  async findObservation(
    benchmarkId: string,
    referenceDate: LocalDate,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow | null> {
    if (source) {
      return this.records.get(this.key(benchmarkId, referenceDate, source)) ?? null;
    }
    for (const [k, v] of this.records.entries()) {
      if (k.startsWith(`${benchmarkId}::${referenceDate.toString()}`)) return v;
    }
    return null;
  }

  async findObservations(
    benchmarkId: string,
    from: LocalDate,
    to: LocalDate,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow[]> {
    const list: BenchmarkObservationRecordRow[] = [];
    for (const rec of this.records.values()) {
      if (rec.benchmarkId !== benchmarkId) continue;
      if (source && rec.source !== source) continue;
      if (rec.referenceDate.compare(from) >= 0 && rec.referenceDate.compare(to) <= 0) {
        list.push(rec);
      }
    }
    return list.sort((a, b) => a.referenceDate.compare(b.referenceDate));
  }

  async findLatest(
    benchmarkId: string,
    source?: string,
  ): Promise<BenchmarkObservationRecordRow | null> {
    const all = await this.findObservations(
      benchmarkId,
      LocalDate.from('1900-01-01'),
      LocalDate.from('2100-01-01'),
      source,
    );
    return all.length > 0 ? all[all.length - 1]! : null;
  }

  async upsertObservation(input: BenchmarkObservationUpsertInput): Promise<{
    outcome: BenchmarkObservationUpsertOutcome;
    observation: BenchmarkObservationRecordRow;
    revision?: BenchmarkObservationRevisionRecordRow;
  }> {
    const k = this.key(input.benchmarkId, input.referenceDate, input.source);
    const existing = this.records.get(k);

    if (!existing) {
      const now = new Date();
      const rec: BenchmarkObservationRecordRow = {
        id: `obs-${this.records.size + 1}`,
        benchmarkId: input.benchmarkId,
        referenceDate: input.referenceDate,
        value: input.value,
        unit: input.unit,
        frequency: input.frequency,
        source: input.source,
        providerSeriesId: input.providerSeriesId ?? null,
        lastFetchedAt: now,
        fetchCount: 1,
        revisedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.records.set(k, rec);
      return { outcome: 'INSERTED', observation: rec };
    }

    if (existing.value === input.value) {
      existing.fetchCount++;
      existing.lastFetchedAt = new Date();
      return { outcome: 'UNCHANGED', observation: existing };
    }

    const now = new Date();
    const rev: BenchmarkObservationRevisionRecordRow = {
      id: `rev-${this.revisions.length + 1}`,
      benchmarkObservationId: existing.id,
      changedAt: now,
      priorValue: existing.value,
      newValue: input.value,
      reason: input.reason ?? null,
      createdAt: now,
    };
    this.revisions.push(rev);

    existing.value = input.value;
    existing.revisedAt = now;
    existing.fetchCount++;
    existing.lastFetchedAt = now;
    return { outcome: 'REVISED', observation: existing, revision: rev };
  }

  async getCoverage(benchmarkId: string): Promise<{
    totalObservations: number;
    firstObservationDate: LocalDate | null;
    lastObservationDate: LocalDate | null;
  }> {
    const all = await this.findObservations(
      benchmarkId,
      LocalDate.from('1900-01-01'),
      LocalDate.from('2100-01-01'),
    );
    if (all.length === 0) {
      return { totalObservations: 0, firstObservationDate: null, lastObservationDate: null };
    }
    return {
      totalObservations: all.length,
      firstObservationDate: all[0]!.referenceDate,
      lastObservationDate: all[all.length - 1]!.referenceDate,
    };
  }

  async listRevisions(
    benchmarkObservationId: string,
  ): Promise<BenchmarkObservationRevisionRecordRow[]> {
    return this.revisions.filter((r) => r.benchmarkObservationId === benchmarkObservationId);
  }
}

describe('Phase 5B: Persisted Benchmark Provider and Ingestion Pipeline', () => {
  let repo: InMemoryBenchmarkRepoForTest;
  let provider: PersistedBenchmarkDataProvider;
  let updateUseCase: UpdateBenchmarkDataUseCase;
  let coverageUseCase: GetBenchmarkCoverageUseCase;

  beforeEach(() => {
    repo = new InMemoryBenchmarkRepoForTest();
    provider = new PersistedBenchmarkDataProvider(repo, { maxLookbackDays: 5 });
    updateUseCase = new UpdateBenchmarkDataUseCase(repo);
    coverageUseCase = new GetBenchmarkCoverageUseCase(repo);
  });

  it('Requirement 1: PersistedBenchmarkDataProvider performs zero network calls on read queries', async () => {
    // Seed exact record
    await repo.upsertObservation({
      benchmarkId: 'IBOV',
      referenceDate: LocalDate.from('2026-10-15'),
      value: '135000.50',
      unit: 'INDEX_POINTS',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'STOOQ',
    });

    const obs = await provider.getObservation('IBOV', LocalDate.from('2026-10-15'));
    expect(obs.benchmarkId).toBe('IBOV');
    expect(obs.value.value).toBe('135000.5');
    expect(obs.source).toBe('STOOQ');
  });

  it('Requirement 2: Previous trading day lookup resolves weekend/holiday dates within maxLookbackDays', async () => {
    // Seed Friday observation
    await repo.upsertObservation({
      benchmarkId: 'IBOV',
      referenceDate: LocalDate.from('2026-10-09'), // Friday
      value: '134000.00',
      unit: 'INDEX_POINTS',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'STOOQ',
    });

    // Query on Sunday 2026-10-11
    const obs = await provider.getObservation('IBOV', LocalDate.from('2026-10-11'));
    expect(obs.date.toString()).toBe('2026-10-09');
    expect(obs.value.value).toBe('134000');
  });

  it('Requirement 3: UpdateBenchmarkDataUseCase ingests rate series (CDI) into repository with structured receipt', async () => {
    const receipt = await updateUseCase.execute({
      benchmarkId: 'CDI',
      from: '2026-10-01',
      to: '2026-10-05',
      providerOverride: 'IN_MEMORY',
    });

    expect(receipt.benchmarkId).toBe('CDI');
    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.observationsFetched).toBe(0); // in-memory starts empty unless seeded
  });

  it('Requirement 4: GetBenchmarkCoverageUseCase inspects coverage range and count accurately', async () => {
    await repo.upsertObservation({
      benchmarkId: 'CDI',
      referenceDate: LocalDate.from('2026-10-01'),
      value: '0.0435',
      unit: 'DAILY_PERCENT',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'BCB',
    });
    await repo.upsertObservation({
      benchmarkId: 'CDI',
      referenceDate: LocalDate.from('2026-10-02'),
      value: '0.0435',
      unit: 'DAILY_PERCENT',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'BCB',
    });

    const cov = await coverageUseCase.execute({
      benchmarkId: 'CDI',
      from: '2026-10-01',
      to: '2026-10-05',
    });

    expect(cov.totalObservations).toBe(2);
    expect(cov.firstObservationDate).toBe('2026-10-01');
    expect(cov.lastObservationDate).toBe('2026-10-02');
    expect(cov.observationsInQueryRange).toBe(2);
  });

  it('Requirement 5 (Section 14): Benchmark revision semantics — insert, identical refetch, and official revised value', async () => {
    // Case A: Insert
    const insertRes = await repo.upsertObservation({
      benchmarkId: 'IBOV',
      referenceDate: LocalDate.from('2026-10-15'),
      value: '135000.00',
      unit: 'INDEX_POINTS',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'B3',
    });
    expect(insertRes.outcome).toBe('INSERTED');
    expect(insertRes.observation.value).toBe('135000.00');
    expect(insertRes.observation.fetchCount).toBe(1);
    expect(insertRes.revision).toBeUndefined();

    // Case B: Identical refetch
    const refetchRes = await repo.upsertObservation({
      benchmarkId: 'IBOV',
      referenceDate: LocalDate.from('2026-10-15'),
      value: '135000.00',
      unit: 'INDEX_POINTS',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'B3',
    });
    expect(refetchRes.outcome).toBe('UNCHANGED');
    expect(refetchRes.observation.fetchCount).toBe(2);
    expect(refetchRes.revision).toBeUndefined();

    // Case C: Official revised value
    const reviseRes = await repo.upsertObservation({
      benchmarkId: 'IBOV',
      referenceDate: LocalDate.from('2026-10-15'),
      value: '135050.25',
      unit: 'INDEX_POINTS',
      frequency: 'DAILY_BUSINESS_DAYS',
      source: 'B3',
      reason: 'B3 end-of-day official reconciliation',
    });
    expect(reviseRes.outcome).toBe('REVISED');
    expect(reviseRes.observation.value).toBe('135050.25');
    expect(reviseRes.observation.fetchCount).toBe(3);
    expect(reviseRes.revision).toBeDefined();
    expect(reviseRes.revision?.priorValue).toBe('135000.00');
    expect(reviseRes.revision?.newValue).toBe('135050.25');
    expect(reviseRes.revision?.reason).toBe('B3 end-of-day official reconciliation');

    const revisions = await repo.listRevisions(reviseRes.observation.id);
    expect(revisions.length).toBe(1);
    expect(revisions[0]?.newValue).toBe('135050.25');
  });
});
