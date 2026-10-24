import { Inject, Injectable, Optional } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IIntegrationConnectionRepository,
  IntegrationConnectionRow,
  IPortfolioRepository,
} from '@atlas/database';
import {
  canExecuteIntegration,
  InvalidIntegrationConnectionError,
  resolveIntegrationAvailability,
  transitionIntegrationConnection,
  type IntegrationAvailability,
  type IntegrationConnectionStatus,
  type SyncState,
} from '@atlas/import-engine';
import { INTEGRATION_CONNECTION_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import {
  INTEGRATION_SCHEDULING_POLICY,
  type IntegrationSchedulingPolicy,
} from './integration-scheduling.tokens';

export interface IntegrationConnectionState {
  status: IntegrationConnectionStatus;
  authorizedAt: Date | null;
  revokedAt: Date | null;
  lastCheckedAt: Date | null;
}

/**
 * Phase 5P-D — persistent integration connection lifecycle.
 *
 * One row per (portfolio, source): whether the portfolio is connected to
 * the source, plus authorization timestamps. Guardrails (all server-side):
 * - connectable sources are an explicit allow-list (B3 only);
 * - provider/environment are server constants (SIMULATED) — CERT/PROD can
 *   never be enabled by request (the DB CHECK is the second barrier);
 * - beginning/completing authorization in production (PREPARING) is
 *   rejected unless the deployment explicitly opts into simulated flows;
 * - transitions go through the pure fail-closed matrix; invalid pairs
 *   throw instead of silently coercing;
 * - the service never sees tokens, secrets, certificates, CPF or raw
 *   consent payloads — there is nowhere to put them (see STEP 21 guard).
 */
@Injectable()
export class IntegrationConnectionService {
  /** Sources with a simulated connection flow in this phase. */
  static readonly CONNECTABLE_SOURCES: readonly string[] = ['B3'];
  static readonly CONNECTION_PROVIDER = 'SIMULATED';
  static readonly CONNECTION_ENVIRONMENT = 'SIMULATED';

  constructor(
    @Inject(INTEGRATION_CONNECTION_REPOSITORY)
    private readonly connections: IIntegrationConnectionRepository,
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Optional()
    @Inject(INTEGRATION_SCHEDULING_POLICY)
    private readonly policy?: IntegrationSchedulingPolicy | null,
  ) {}

  private allowSimulated(): boolean {
    return this.policy?.allowSimulatedSchedules ?? true;
  }

  private assertConnectable(source: string): void {
    if (!IntegrationConnectionService.CONNECTABLE_SOURCES.includes(source)) {
      throw new InvalidIntegrationConnectionError(
        `Fonte "${source}" não possui conexão gerenciada`,
      );
    }
  }

  private assertSimulatedAllowed(): void {
    if (!this.allowSimulated()) {
      throw new InvalidIntegrationConnectionError('Conexão simulada indisponível neste ambiente');
    }
  }

  private async verifyOwnership(portfolioId: string, userId?: string): Promise<void> {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
  }

  private static asStatus(status: string): IntegrationConnectionStatus {
    const allowed: readonly string[] = [
      'NOT_CONNECTED',
      'AWAITING_AUTHORIZATION',
      'AUTHORIZED',
      'REQUIRES_REAUTHORIZATION',
      'REVOKED',
    ];
    if (!allowed.includes(status)) {
      throw new InvalidIntegrationConnectionError(`Estado de conexão desconhecido: "${status}"`);
    }
    return status as IntegrationConnectionStatus;
  }

  private toState(row: IntegrationConnectionRow): IntegrationConnectionState {
    return {
      status: IntegrationConnectionService.asStatus(row.status),
      authorizedAt: row.authorizedAt,
      revokedAt: row.revokedAt,
      lastCheckedAt: row.lastCheckedAt,
    };
  }

  /** Current persisted connection, or null when never connected. */
  async getConnection(
    portfolioId: string,
    source: string,
    userId?: string,
  ): Promise<IntegrationConnectionRow | null> {
    this.assertConnectable(source);
    await this.verifyOwnership(portfolioId, userId);
    return this.connections.findByPortfolioAndSource(portfolioId, source);
  }

  /**
   * Eligibility for background execution (scheduler + worker choke point).
   * No user context: repository lookups are portfolio-scoped; the API layer
   * owns authentication/authorization. Fail-closed on missing rows.
   */
  async isEligible(portfolioId: string, source: string): Promise<boolean> {
    if (!IntegrationConnectionService.CONNECTABLE_SOURCES.includes(source)) {
      return false;
    }
    const availability: IntegrationAvailability = resolveIntegrationAvailability({
      source,
      allowSimulated: this.allowSimulated(),
    });
    const row = await this.connections.findByPortfolioAndSource(portfolioId, source);
    return canExecuteIntegration({
      availability,
      connectionStatus: row ? IntegrationConnectionService.asStatus(row.status) : null,
    });
  }

  async beginAuthorization(
    command: { portfolioId: string; userId?: string; source: string },
    now: Date = new Date(),
  ): Promise<IntegrationConnectionState> {
    this.assertConnectable(command.source);
    this.assertSimulatedAllowed();
    await this.verifyOwnership(command.portfolioId, command.userId);
    const row = await this.connections.ensure({
      portfolioId: command.portfolioId,
      source: command.source,
      provider: IntegrationConnectionService.CONNECTION_PROVIDER,
      environment: IntegrationConnectionService.CONNECTION_ENVIRONMENT,
    });
    const next = transitionIntegrationConnection(
      IntegrationConnectionService.asStatus(row.status),
      'BEGIN_AUTHORIZATION',
    );
    const updated = await this.connections.update({
      id: row.id,
      portfolioId: command.portfolioId,
      status: next,
      authorizedAt: row.authorizedAt,
      revokedAt: row.revokedAt,
      lastCheckedAt: now,
    });
    return this.toState(updated);
  }

  async completeAuthorization(
    command: { portfolioId: string; userId?: string; source: string },
    now: Date = new Date(),
  ): Promise<IntegrationConnectionState> {
    this.assertConnectable(command.source);
    this.assertSimulatedAllowed();
    await this.verifyOwnership(command.portfolioId, command.userId);
    const row = await this.connections.findByPortfolioAndSource(
      command.portfolioId,
      command.source,
    );
    if (!row) {
      throw new InvalidIntegrationConnectionError(
        'Nenhum fluxo de autorização em andamento para esta integração',
      );
    }
    const next = transitionIntegrationConnection(
      IntegrationConnectionService.asStatus(row.status),
      'COMPLETE_AUTHORIZATION',
    );
    const updated = await this.connections.update({
      id: row.id,
      portfolioId: command.portfolioId,
      status: next,
      authorizedAt: now,
      revokedAt: null,
      lastCheckedAt: now,
    });
    return this.toState(updated);
  }

  async revoke(
    command: { portfolioId: string; userId?: string; source: string },
    now: Date = new Date(),
  ): Promise<IntegrationConnectionState> {
    this.assertConnectable(command.source);
    this.assertSimulatedAllowed();
    await this.verifyOwnership(command.portfolioId, command.userId);
    const row = await this.connections.findByPortfolioAndSource(
      command.portfolioId,
      command.source,
    );
    if (!row) {
      throw new InvalidIntegrationConnectionError('Nenhuma conexão para revogar');
    }
    const next = transitionIntegrationConnection(
      IntegrationConnectionService.asStatus(row.status),
      'REVOKE',
    );
    const updated = await this.connections.update({
      id: row.id,
      portfolioId: command.portfolioId,
      status: next,
      authorizedAt: row.authorizedAt,
      revokedAt: now,
      lastCheckedAt: now,
    });
    return this.toState(updated);
  }

  /**
   * Future-ready authorization check. In this phase the simulated provider
   * is the source of truth (default AUTHORIZED); tests inject other states
   * to prove the transitions. A technical failure (ERROR) never revokes:
   * only lastCheckedAt moves.
   */
  async checkAuthorization(
    command: {
      portfolioId: string;
      userId?: string;
      source: string;
      providerStatus?: SyncState;
    },
    now: Date = new Date(),
  ): Promise<IntegrationConnectionState> {
    this.assertConnectable(command.source);
    await this.verifyOwnership(command.portfolioId, command.userId);
    const row = await this.connections.findByPortfolioAndSource(
      command.portfolioId,
      command.source,
    );
    if (!row) {
      return { status: 'NOT_CONNECTED', authorizedAt: null, revokedAt: null, lastCheckedAt: null };
    }
    const current = IntegrationConnectionService.asStatus(row.status);
    const providerStatus = command.providerStatus ?? 'AUTHORIZED';
    if (providerStatus === 'ERROR') {
      const updated = await this.connections.update({
        id: row.id,
        portfolioId: command.portfolioId,
        status: current,
        authorizedAt: row.authorizedAt,
        revokedAt: row.revokedAt,
        lastCheckedAt: now,
      });
      return this.toState(updated);
    }
    if (current === 'AUTHORIZED' && providerStatus === 'REVOKED') {
      const updated = await this.connections.update({
        id: row.id,
        portfolioId: command.portfolioId,
        status: 'REVOKED',
        authorizedAt: row.authorizedAt,
        revokedAt: now,
        lastCheckedAt: now,
      });
      return this.toState(updated);
    }
    if (current === 'AUTHORIZED' && providerStatus === 'REQUIRES_REAUTHORIZATION') {
      const updated = await this.connections.update({
        id: row.id,
        portfolioId: command.portfolioId,
        status: 'REQUIRES_REAUTHORIZATION',
        authorizedAt: row.authorizedAt,
        revokedAt: row.revokedAt,
        lastCheckedAt: now,
      });
      return this.toState(updated);
    }
    if (
      (current === 'REQUIRES_REAUTHORIZATION' || current === 'REVOKED') &&
      providerStatus === 'AUTHORIZED'
    ) {
      const updated = await this.connections.update({
        id: row.id,
        portfolioId: command.portfolioId,
        status: 'AUTHORIZED',
        authorizedAt: now,
        revokedAt: null,
        lastCheckedAt: now,
      });
      return this.toState(updated);
    }
    const updated = await this.connections.update({
      id: row.id,
      portfolioId: command.portfolioId,
      status: current,
      authorizedAt: row.authorizedAt,
      revokedAt: row.revokedAt,
      lastCheckedAt: now,
    });
    return this.toState(updated);
  }
}
