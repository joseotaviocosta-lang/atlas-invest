import { describe, expect, it, vi } from 'vitest';
import { IntegrationConnectionService } from '../../apps/api/src/application/imports/integration-connection.service';

/**
 * Phase 5P-D — connection policy unit tests (no DB, no Nest app).
 *
 * The lifecycle is fail-closed: unknown sources, invalid transitions and
 * production (PREPARING) flows all throw before touching persistence.
 * Idempotent begins never duplicate; revocation always preserves history
 * fields.
 */
describe('Phase 5P-D: connection policy', () => {
  const NOW = new Date('2026-06-16T12:00:00Z');

  function service(
    policy: { allowSimulatedSchedules: boolean },
    overrides: { row?: Record<string, unknown> | null } = {},
  ) {
    const stored =
      overrides.row === undefined ? null : (overrides.row as Record<string, unknown> | null);
    const connections = {
      findByPortfolioAndSource: vi.fn(async () => stored),
      ensure: vi.fn(async (input: Record<string, unknown>) => ({
        id: 'conn-1',
        portfolioId: input.portfolioId,
        source: input.source,
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: 'NOT_CONNECTED',
        authorizedAt: null,
        revokedAt: null,
        lastCheckedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      })),
      update: vi.fn(async (input: Record<string, unknown>) => ({
        id: 'conn-1',
        portfolioId: 'p1',
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
        status: input.status,
        authorizedAt: (input.authorizedAt ?? null) as Date | null,
        revokedAt: (input.revokedAt ?? null) as Date | null,
        lastCheckedAt: (input.lastCheckedAt ?? null) as Date | null,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    };
    const portfolios = {
      findById: vi.fn(async () => ({ id: 'p1', userId: 'u1' })),
      findByIdAndUserId: vi.fn(async () => ({ id: 'p1', userId: 'u1' })),
      findByUserId: vi.fn(async () => [{ id: 'p1', userId: 'u1' }]),
    };
    const svc = new IntegrationConnectionService(connections as never, portfolios as never, policy);
    return { svc, connections, portfolios };
  }

  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'conn-1',
    portfolioId: 'p1',
    source: 'B3',
    provider: 'SIMULATED',
    environment: 'SIMULATED',
    status: 'AUTHORIZED',
    authorizedAt: new Date('2026-06-15T12:00:00Z'),
    revokedAt: null,
    lastCheckedAt: new Date('2026-06-15T12:00:00Z'),
    createdAt: new Date('2026-06-15T12:00:00Z'),
    updatedAt: new Date('2026-06-15T12:00:00Z'),
    ...overrides,
  });

  it('creates the lifecycle row NOT_CONNECTED and advances it on begin', async () => {
    const { svc, connections } = service({ allowSimulatedSchedules: true });
    const state = await svc.beginAuthorization(
      { portfolioId: 'p1', userId: 'u1', source: 'B3' },
      NOW,
    );
    expect(state.status).toBe('AWAITING_AUTHORIZATION');
    expect(connections.ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioId: 'p1',
        source: 'B3',
        provider: 'SIMULATED',
        environment: 'SIMULATED',
      }),
    );
  });

  it('completes the simulated flow into AUTHORIZED with timestamps', async () => {
    const { svc } = service(
      { allowSimulatedSchedules: true },
      { row: row({ status: 'AWAITING_AUTHORIZATION', authorizedAt: null }) },
    );
    const state = await svc.completeAuthorization(
      { portfolioId: 'p1', userId: 'u1', source: 'B3' },
      NOW,
    );
    expect(state).toMatchObject({ status: 'AUTHORIZED', revokedAt: null });
    expect(state.authorizedAt).toEqual(NOW);
    expect(state.lastCheckedAt).toEqual(NOW);
  });

  it('revokes from AUTHORIZED preserving history and blocking execution', async () => {
    const { svc } = service({ allowSimulatedSchedules: true }, { row: row() });
    const state = await svc.revoke({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW);
    expect(state.status).toBe('REVOKED');
    expect(state.revokedAt).toEqual(NOW);
    expect(state.authorizedAt).toEqual(new Date('2026-06-15T12:00:00Z'));

    const revoked = service(
      { allowSimulatedSchedules: true },
      { row: row({ status: 'REVOKED', revokedAt: NOW }) },
    );
    expect(await revoked.svc.isEligible('p1', 'B3')).toBe(false);
  });

  it('re-authorizes through a fresh begin after revocation', async () => {
    const revokedAt = new Date('2026-06-15T12:00:00Z');
    const { svc } = service(
      { allowSimulatedSchedules: true },
      { row: row({ status: 'REVOKED', revokedAt }) },
    );
    const begun = await svc.beginAuthorization(
      { portfolioId: 'p1', userId: 'u1', source: 'B3' },
      NOW,
    );
    expect(begun.status).toBe('AWAITING_AUTHORIZATION');
  });

  it('fails closed on invalid transitions', async () => {
    const revoked = service({ allowSimulatedSchedules: true }, { row: row({ status: 'REVOKED' }) });
    await expect(
      revoked.svc.completeAuthorization({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW),
    ).rejects.toThrow();

    const missing = service({ allowSimulatedSchedules: true }, { row: null });
    await expect(
      missing.svc.completeAuthorization({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW),
    ).rejects.toThrow();
    await expect(
      missing.svc.revoke({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW),
    ).rejects.toThrow();
  });

  it('rejects unknown sources before touching persistence', async () => {
    const { svc, connections } = service({ allowSimulatedSchedules: true });
    await expect(
      svc.beginAuthorization({ portfolioId: 'p1', userId: 'u1', source: 'BROKER_X' }, NOW),
    ).rejects.toThrow();
    expect(connections.ensure).not.toHaveBeenCalled();
    expect(await svc.isEligible('p1', 'BROKER_X')).toBe(false);
  });

  it('blocks simulated flows when the deployment did not opt in', async () => {
    const { svc } = service({ allowSimulatedSchedules: false });
    await expect(
      svc.beginAuthorization({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW),
    ).rejects.toThrow();
    await expect(
      svc.completeAuthorization({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW),
    ).rejects.toThrow();
    await expect(
      svc.revoke({ portfolioId: 'p1', userId: 'u1', source: 'B3' }, NOW),
    ).rejects.toThrow();
    expect(await svc.isEligible('p1', 'B3')).toBe(false);
  });

  it('checks reconcile provider truth: revoke, re-auth, or stamp only', async () => {
    const { svc } = service({ allowSimulatedSchedules: true }, { row: row() });
    const revoked = await svc.checkAuthorization(
      { portfolioId: 'p1', userId: 'u1', source: 'B3', providerStatus: 'REVOKED' },
      NOW,
    );
    expect(revoked.status).toBe('REVOKED');

    const { svc: svc2 } = service({ allowSimulatedSchedules: true }, { row: row() });
    const reauth = await svc2.checkAuthorization(
      {
        portfolioId: 'p1',
        userId: 'u1',
        source: 'B3',
        providerStatus: 'REQUIRES_REAUTHORIZATION',
      },
      NOW,
    );
    expect(reauth.status).toBe('REQUIRES_REAUTHORIZATION');

    const { svc: svc3, connections: conns3 } = service(
      { allowSimulatedSchedules: true },
      { row: row() },
    );
    const errored = await svc3.checkAuthorization(
      { portfolioId: 'p1', userId: 'u1', source: 'B3', providerStatus: 'ERROR' },
      NOW,
    );
    expect(errored.status).toBe('AUTHORIZED');
    expect(errored.lastCheckedAt).toEqual(NOW);
    expect(conns3.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'AUTHORIZED' }));
  });

  it('restores AUTHORIZED when the provider confirms after re-auth', async () => {
    const { svc } = service(
      { allowSimulatedSchedules: true },
      { row: row({ status: 'REQUIRES_REAUTHORIZATION' }) },
    );
    const state = await svc.checkAuthorization(
      { portfolioId: 'p1', userId: 'u1', source: 'B3', providerStatus: 'AUTHORIZED' },
      NOW,
    );
    expect(state.status).toBe('AUTHORIZED');
    expect(state.revokedAt).toBeNull();
  });

  it('stays eligible only while available and authorized', async () => {
    const { svc } = service({ allowSimulatedSchedules: true }, { row: row() });
    expect(await svc.isEligible('p1', 'B3')).toBe(true);

    const { svc: awaiting } = service(
      { allowSimulatedSchedules: true },
      { row: row({ status: 'AWAITING_AUTHORIZATION' }) },
    );
    expect(await awaiting.isEligible('p1', 'B3')).toBe(false);

    const { svc: missing } = service({ allowSimulatedSchedules: true }, { row: null });
    expect(await missing.isEligible('p1', 'B3')).toBe(false);
  });
});
