import { describe, expect, it, vi } from 'vitest';
import { IntegrationScheduleService } from '../../apps/api/src/application/imports/integration-schedule.service';
import { InvalidScheduleInputError } from '@atlas/import-engine';

/**
 * Phase 5P-A — schedule policy unit tests (no DB, no Nest app).
 *
 * Production default is inert: simulated schedules cannot be enabled
 * unless the deployment explicitly opts in, and new schedules default to
 * disabled. Unknown sources and cadences fail closed at the service edge.
 */
describe('Phase 5P-A: schedule policy', () => {
  function service(policy?: { allowSimulatedSchedules: boolean }) {
    const schedules = {
      create: vi.fn(async (input: Record<string, unknown>) => ({ id: 'sched-1', ...input })),
      update: vi.fn(),
      touch: vi.fn(),
      findById: vi.fn(),
      listByPortfolio: vi.fn(async () => []),
      listDue: vi.fn(async () => []),
    };
    const portfolios = {
      findById: vi.fn(),
      findByIdAndUserId: vi.fn(async () => ({ id: 'p1', userId: 'u1' })),
      findByUserId: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
    };
    return {
      service: new IntegrationScheduleService(
        schedules as never,
        portfolios as never,
        policy ?? null,
      ),
      schedules,
    };
  }

  it('creates schedules disabled by default and computes the next slot only when enabled', async () => {
    const { service: svc, schedules } = service({ allowSimulatedSchedules: true });
    const created = (await svc.createSchedule(
      {
        portfolioId: 'p1',
        userId: 'u1',
        source: 'B3',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
      },
      new Date('2026-06-15T12:00:00Z'),
    )) as { enabled: boolean; nextRunAt: Date | null };
    expect(created.enabled).toBe(false);
    expect(created.nextRunAt).toBeNull();
    expect(schedules.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'SIMULATED', environment: 'SIMULATED' }),
    );
  });

  it('refuses to enable simulated schedules when the deployment did not opt in', async () => {
    const { service: svc } = service({ allowSimulatedSchedules: false });
    await expect(
      svc.createSchedule(
        {
          portfolioId: 'p1',
          userId: 'u1',
          source: 'B3',
          cadence: 'DAILY',
          hourLocal: 8,
          minuteLocal: 0,
          enabled: true,
        },
        new Date('2026-06-15T12:00:00Z'),
      ),
    ).rejects.toThrow(InvalidScheduleInputError);
  });

  it('rejects unschedulable sources and unknown cadences before touching the database', async () => {
    const { service: svc, schedules } = service({ allowSimulatedSchedules: true });
    await expect(
      svc.createSchedule({
        portfolioId: 'p1',
        userId: 'u1',
        source: 'NOPE',
        cadence: 'DAILY',
        hourLocal: 8,
        minuteLocal: 0,
      }),
    ).rejects.toThrow(InvalidScheduleInputError);
    await expect(
      svc.createSchedule({
        portfolioId: 'p1',
        userId: 'u1',
        source: 'B3',
        cadence: 'HOURLY',
        hourLocal: 8,
        minuteLocal: 0,
      }),
    ).rejects.toThrow(InvalidScheduleInputError);
    expect(schedules.create).not.toHaveBeenCalled();
  });
});
