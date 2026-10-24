import { describe, expect, it, vi } from 'vitest';
import { IntegrationSettingsService } from '../../apps/api/src/application/imports/integration-settings.service';

/**
 * Phase 5P-C — settings policy unit tests (no DB, no Nest app).
 *
 * Capability flags are honest UX hints: enabling is blocked without an
 * explicit simulated-schedules opt-in, disabling is always safe, editing
 * requires the opt-in too. Enforcement itself stays in the schedule
 * service + strict DTOs.
 */
describe('Phase 5P-C: settings policy', () => {
  function service(
    policy: { allowSimulatedSchedules: boolean },
    overrides: {
      schedule?: Record<string, unknown> | null;
      runs?: Array<Record<string, unknown>>;
      hasRunning?: boolean;
      /** Persisted connection status; null = no connection row. Defaults to AUTHORIZED. */
      connection?: string | null;
    } = {},
  ) {
    const schedule =
      overrides.schedule === undefined
        ? {
            id: 'sched-1',
            portfolioId: 'p1',
            source: 'B3',
            cadence: 'DAILY',
            hourLocal: 8,
            minuteLocal: 0,
            timezone: 'America/Sao_Paulo',
            enabled: false,
            nextRunAt: new Date('2026-06-16T11:00:00Z'),
            lastRunAt: null,
            lastStatus: null,
          }
        : overrides.schedule;
    const schedules = { listByPortfolio: vi.fn(async () => (schedule ? [schedule] : [])) };
    const portfolios = {
      findById: vi.fn(),
      findByIdAndUserId: vi.fn(async () => ({ id: 'p1', userId: 'u1' })),
      findByUserId: vi.fn(async () => []),
    };
    const jobs = { hasRunningJob: vi.fn(async () => overrides.hasRunning ?? false) };
    const runs = { listRecentByPortfolioIds: vi.fn(async () => overrides.runs ?? []) };
    const persistedStatus =
      overrides.connection === undefined ? 'AUTHORIZED' : overrides.connection;
    const connections = {
      findByPortfolioAndSource: vi.fn(async () =>
        persistedStatus === null
          ? null
          : {
              id: 'conn-1',
              portfolioId: 'p1',
              source: 'B3',
              provider: 'SIMULATED',
              environment: 'SIMULATED',
              status: persistedStatus,
              authorizedAt: new Date('2026-06-15T12:00:00Z'),
              revokedAt: null,
              lastCheckedAt: new Date('2026-06-15T12:00:00Z'),
              createdAt: new Date('2026-06-15T12:00:00Z'),
              updatedAt: new Date('2026-06-16T11:00:00Z'),
            },
      ),
    };
    const svc = new IntegrationSettingsService(
      portfolios as never,
      schedules as never,
      jobs as never,
      runs as never,
      connections as never,
      policy,
    );
    return { svc, schedules, jobs, runs, connections };
  }

  const run = (overrides: Record<string, unknown> = {}) => ({
    id: 'run-1',
    portfolioId: 'p1',
    source: 'B3',
    trigger: 'SCHEDULED',
    status: 'AWAITING_REVIEW',
    newCandidates: 0,
    exactDuplicates: 0,
    probableDuplicates: 0,
    conflicts: 0,
    unsupported: 0,
    invalid: 0,
    partial: false,
    reconciliation: null,
    createdAt: new Date('2026-06-16T11:05:00Z'),
    completedAt: null,
    ...overrides,
  });

  it('exposes AVAILABLE + READY with no schedule and flips canEnable on policy', async () => {
    const dev = await service(
      { allowSimulatedSchedules: true },
      { schedule: null },
    ).svc.getSettings('u1', 'p1');
    expect(dev.sources[0]).toMatchObject({ availability: 'AVAILABLE', status: 'READY' });

    const prod = await service(
      { allowSimulatedSchedules: false },
      { schedule: null },
    ).svc.getSettings('u1', 'p1');
    expect(prod.sources[0].availability).toBe('PREPARING');
    expect(prod.sources[0].status).toBe('PREPARING');
  });

  it('gates enable/edit on the simulated-schedule opt-in, never on disable', async () => {
    const dev = await service({ allowSimulatedSchedules: true }).svc.getSettings('u1', 'p1');
    expect(dev.sources[0]).toMatchObject({
      canEnable: true,
      canEditSchedule: true,
      canDisable: false,
    });

    const prod = await service({ allowSimulatedSchedules: false }).svc.getSettings('u1', 'p1');
    expect(prod.sources[0]).toMatchObject({ canEnable: false, canEditSchedule: false });
    expect(prod.sources[0].status).toBe('PREPARING');
  });

  it('allows disable once enabled and reports paused state', async () => {
    const { svc } = service(
      { allowSimulatedSchedules: true },
      { schedule: { id: 's1', portfolioId: 'p1', source: 'B3', enabled: true } },
    );
    const model = await svc.getSettings('u1', 'p1');
    expect(model.sources[0]).toMatchObject({
      canDisable: true,
      canEnable: false,
      status: 'SCHEDULED_ACTIVE',
    });
  });

  it('marks failed terminal runs SYNC_ERROR and successful ones as last success', async () => {
    const { svc } = service(
      { allowSimulatedSchedules: true },
      {
        schedule: null,
        runs: [run({ id: 'f1', status: 'FAILED' })],
      },
    );
    const failed = await svc.getSettings('u1', 'p1');
    expect(failed.sources[0].status).toBe('SYNC_ERROR');
    expect(failed.sources[0].lastSuccessfulRun).toBeNull();

    const { svc: svc2 } = service(
      { allowSimulatedSchedules: true },
      {
        schedule: null,
        runs: [
          run({
            id: 'ok',
            status: 'AWAITING_REVIEW',
            newCandidates: 0,
            createdAt: new Date('2026-06-17T11:00:00Z'),
          }),
          run({ id: 'f1', status: 'FAILED', createdAt: new Date('2026-06-16T11:00:00Z') }),
        ],
      },
    );
    const recovered = await svc2.getSettings('u1', 'p1');
    expect(recovered.sources[0].lastSuccessfulRun).toMatchObject({ id: 'ok' });
  });

  it('surfaces SYNCING while a job runs, above any terminal outcome', async () => {
    const { svc } = service(
      { allowSimulatedSchedules: true },
      {
        schedule: { id: 's1', portfolioId: 'p1', source: 'B3', enabled: true },
        hasRunning: true,
        runs: [run({ status: 'FAILED' })],
      },
    );
    const model = await svc.getSettings('u1', 'p1');
    expect(model.sources[0].status).toBe('SYNCING');
  });

  it('counts pending review items through the shared derivation', async () => {
    const { svc } = service(
      { allowSimulatedSchedules: true },
      { schedule: null, runs: [run({ newCandidates: 3 })] },
    );
    const model = await svc.getSettings('u1', 'p1');
    expect(model.sources[0].pendingReviewCount).toBe(1);
    expect(model.sources[0].status).toBe('PENDING_REVIEW');
  });

  it('reads the persisted connection instead of assuming authorization', async () => {
    const { svc } = service({ allowSimulatedSchedules: true }, { connection: null });
    const model = await svc.getSettings('u1', 'p1');
    expect(model.sources[0].connection.state).toBe('NOT_CONNECTED');
    expect(model.sources[0].status).toBe('NOT_CONNECTED');

    const { svc: revoked } = service({ allowSimulatedSchedules: true }, { connection: 'REVOKED' });
    const revokedModel = await revoked.getSettings('u1', 'p1');
    expect(revokedModel.sources[0].connection.state).toBe('NEEDS_REAUTH');
    expect(revokedModel.sources[0].status).toBe('NEEDS_REAUTH');

    const { svc: awaiting } = service(
      { allowSimulatedSchedules: true },
      { connection: 'AWAITING_AUTHORIZATION' },
    );
    const awaitingModel = await awaiting.getSettings('u1', 'p1');
    expect(awaitingModel.sources[0].connection.state).toBe('AWAITING_AUTHORIZATION');
    expect(awaitingModel.sources[0].status).toBe('AWAITING_AUTHORIZATION');
  });
});
