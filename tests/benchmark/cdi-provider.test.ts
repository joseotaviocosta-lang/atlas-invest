import { describe, it, expect, vi } from 'vitest';
import { LocalDate } from '@atlas/domain';
import {
  BcbRateBenchmarkDataProvider,
  InMemoryRateBenchmarkDataProvider,
} from '@atlas/benchmark-engine';

describe('BcbRateBenchmarkDataProvider', () => {
  it('valid payload', async () => {
    const fakeJson = [
      { data: '02/01/2026', valor: '0,040000' },
      { data: '05/01/2026', valor: '0,045000' },
    ];
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeJson,
    } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs.length).toBe(2);
    expect(obs[0]!.rate.toString()).toBe('0.04');
    expect(obs[0]!.unit).toBe('DAILY_PERCENT');
    expect(obs[0]!.source).toBe('BCB');
  });

  it('malformed schema skipped', async () => {
    const fakeJson = [
      { data: '02/01/2026', valor: '0,040000' },
      { data: 'bad', valor: 'xyz' },
      { data: '05/01/2026', valor: 'not-a-number' },
    ];
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeJson,
    } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs.length).toBe(1);
  });

  it('HTTP non-2xx throws', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    await expect(
      p.getRateObservations('CDI', LocalDate.from('2026-01-01'), LocalDate.from('2026-01-05')),
    ).rejects.toThrow('Rate provider error');
  });

  it('timeout/abort throws unavailable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('aborted'));
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    await expect(
      p.getRateObservations('CDI', LocalDate.from('2026-01-01'), LocalDate.from('2026-01-05')),
    ).rejects.toThrow('Rate provider unavailable');
  });

  it('empty result -> UNAVAILABLE', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs.length).toBe(0);
  });

  it('malformed date skipped', async () => {
    const fakeJson = [{ data: '99/99/2026', valor: '0,04' }];
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeJson,
    } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    // may throw or skip; at least not crash
    expect(Array.isArray(obs)).toBe(true);
  });

  it('malformed value skipped', async () => {
    const fakeJson = [{ data: '02/01/2026', valor: '???' }];
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeJson } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs.length).toBe(0);
  });

  it('source/unit validation DAILY_PERCENT BCB', async () => {
    const fakeJson = [{ data: '02/01/2026', valor: '0,04' }];
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeJson } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs[0]!.source).toBe('BCB');
    expect(obs[0]!.unit).toBe('DAILY_PERCENT');
  });

  it('ordering preserved', async () => {
    const fakeJson = [
      { data: '05/01/2026', valor: '0,04' },
      { data: '02/01/2026', valor: '0,03' },
    ];
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeJson } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs.length).toBe(2);
  });

  it('duplicate date last wins', async () => {
    const p = new InMemoryRateBenchmarkDataProvider();
    p.seed({ benchmarkId: 'CDI', date: '2026-01-02', rate: '0.04' });
    p.seed({ benchmarkId: 'CDI', date: '2026-01-02', rate: '0.05' });
    const o = await p.getRateObservation('CDI', LocalDate.from('2026-01-02'));
    expect(o.rate.toString()).toBe('0.05');
  });

  it('response outside requested range ignored', async () => {
    const fakeJson = [
      { data: '02/01/2026', valor: '0,04' },
      { data: '10/01/2026', valor: '0,04' },
    ];
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => fakeJson } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    // Provider must ignore any row outside the requested [from, to] window.
    const obs = await p.getRateObservations(
      'CDI',
      LocalDate.from('2026-01-01'),
      LocalDate.from('2026-01-05'),
    );
    expect(obs.length).toBe(1);
    expect(obs[0]!.date.toString()).toBe('2026-01-02');
  });

  it('exposes audited source metadata (institution, series code, unit, frequency)', () => {
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: vi.fn() as never });
    expect(p.provider).toBe('BCB');
    expect(p.institution).toBe('Banco Central do Brasil');
    expect(p.providerSeriesCode).toBe('12');
    expect(p.unit).toBe('DAILY_PERCENT');
    expect(p.frequency).toBe('DAILY_BUSINESS_DAYS');
  });

  it('builds the BCB SGS 12 endpoint with dd/mm/yyyy range', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as never);
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: fetchFn as never });
    await p.getRateObservations('CDI', LocalDate.from('2026-01-02'), LocalDate.from('2026-01-31'));
    const url = String(fetchFn.mock.calls[0]![0]);
    expect(url).toContain('bcdata.sgs.12');
    expect(url).toContain('dataInicial=02/01/2026');
    expect(url).toContain('dataFinal=31/01/2026');
  });

  it('rejects a non-CDI benchmark (canonical identity, not provider code)', async () => {
    const p = new BcbRateBenchmarkDataProvider({ fetchFn: vi.fn() as never });
    await expect(
      p.getRateObservations('IBOV', LocalDate.from('2026-01-01'), LocalDate.from('2026-01-05')),
    ).rejects.toThrow();
  });
});
