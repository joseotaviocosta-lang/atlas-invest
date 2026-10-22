import type { B3MovementRecord, B3SyncSourceProvider, SimulatedB3Page } from '@atlas/import-engine';
import type { SyncState } from '@atlas/import-engine';
import type { B3HttpClient } from './client';
import type { B3TokenCache } from './auth';
import { z } from 'zod';
import { B3TransportError } from './errors';
import { collectB3Pages, type B3Page } from './pagination';
import { B3GuiaResponseSchema, parseB3JsonPayload } from './dto';
import { mapAuthorizationVerdictToSyncState, type B3AuthorizationVerdict } from './consent';
import { resolveSourceAsOf } from './freshness';
import type { ValidatedB3IntegrationConfig } from './config';

/**
 * Phase 5O-B — real B3 HTTP provider skeleton (transport only, CERT-gated).
 *
 * Implements the same source capabilities as the simulated provider, but
 * asynchronously: an HTTP source cannot be synchronous, so this provider
 * exposes `B3AsyncSourceProvider` instead of deforming the synchronous
 * `B3SyncSourceProvider` contract. The 5P certification phase will add an
 * async orchestration variant; the canonical pipeline (normalize →
 * classify → preview → confirm → ledger) is reused unchanged.
 *
 * Hard boundaries (structurally enforced, test-pinned):
 * - no ledger access, no dedupe decisions, no position correction, no tax;
 * - mappers receive zod-validated DTOs only (never raw JSON);
 * - no network without a validated CERT/PROD config (fail-closed).
 */
export interface B3PositionSnapshotRow {
  ticker: string;
  quantity: string;
}

export interface B3AsyncSourceProvider {
  getAuthorizationStatus(signal?: AbortSignal): Promise<SyncState>;
  getMovements(
    query: { dateFrom: string; dateTo: string },
    signal?: AbortSignal,
  ): Promise<SimulatedB3Page<B3MovementRecord>>;
  getProvisionedEvents(signal?: AbortSignal): Promise<SimulatedB3Page<B3MovementRecord>>;
  getPositions(signal?: AbortSignal): Promise<SimulatedB3Page<B3PositionSnapshotRow>>;
}

/**
 * Per-API mapping from a VALIDATED transport DTO to canonical records.
 * The concrete B3 shapes are UNCONFIRMED without the CERT package, so 5O-B
 * ships the interface plus a strict fixture mapper for contract tests; the
 * production mapper lands with certification (5P).
 */
export interface B3ApiMapper {
  mapMovements(payload: unknown): B3MovementRecord[];
  mapPositions(payload: unknown): B3PositionSnapshotRow[];
  mapProvisionedEvents(payload: unknown): B3MovementRecord[];
}

/**
 * Wraps a strict zod schema plus a pure mapping function: the mapper body
 * provably receives only validated DTOs (INVALID_UPSTREAM_PAYLOAD otherwise).
 */
export function createStrictB3Mapper<T, R>(
  schema: z.ZodType<T>,
  map: (dto: T) => R,
): (payload: unknown) => R {
  return (payload: unknown) => map(parseB3JsonPayload(schema, payload));
}

const B3AuthorizationAnswerSchema = z
  .object({ authorized: z.boolean() })
  .passthrough()
  .describe('UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE');

const B3FintechSystemSchema = z
  .object({ lastLoadDate: z.string().min(1) })
  .passthrough()
  .describe('UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE');

export interface B3HttpProviderOptions {
  config: ValidatedB3IntegrationConfig;
  client: B3HttpClient;
  mapper: B3ApiMapper;
  tokens: B3TokenCache;
  /** Current sync state, for verdict mapping (defaults to NOT_CONNECTED). */
  previousState?: SyncState;
}

export class B3HttpProvider implements B3AsyncSourceProvider {
  constructor(private readonly options: B3HttpProviderOptions) {
    if (!options.config.baseUrl) {
      throw new B3TransportError(
        'CONFIGURATION_ERROR',
        'B3HttpProvider requires a validated CERT/PROD config',
      );
    }
  }

  async getAuthorizationStatus(signal?: AbortSignal): Promise<SyncState> {
    const token = await this.options.tokens.getToken(signal);
    const { data } = await this.options.client.request({
      path: '/investidor/autorizacao-fintech',
      query: {},
      responseSchema: B3AuthorizationAnswerSchema,
      endpoint: 'autorizacao-fintech',
      bearerToken: token,
      signal,
    });
    const verdict: B3AuthorizationVerdict = data.authorized ? 'AUTHORIZED' : 'NOT_AUTHORIZED';
    return mapAuthorizationVerdictToSyncState(
      verdict,
      this.options.previousState ?? 'NOT_CONNECTED',
    );
  }

  async getMovements(
    query: { dateFrom: string; dateTo: string },
    signal?: AbortSignal,
  ): Promise<SimulatedB3Page<B3MovementRecord>> {
    const token = await this.options.tokens.getToken(signal);
    // Guia-first strategy (5O-B discovery): the guide reports which authorized
    // documents carry data on the reference date, so product calls are only
    // made when needed. Per-document fan-out lands with certification (5P).
    await this.options.client.request({
      path: '/investidor/guia',
      query: { data: query.dateFrom, produto: 'TODOS' },
      responseSchema: B3GuiaResponseSchema,
      endpoint: 'api-guia',
      bearerToken: token,
      signal,
    });
    const collected = await collectB3Pages<B3MovementRecord>(
      async (cursor) => {
        const { data } = await this.options.client.request({
          path: '/investidor/movimentacao',
          query: {
            dataInicio: query.dateFrom,
            dataFim: query.dateTo,
            ...(cursor ? { cursor } : {}),
          },
          responseSchema: z.object({
            items: z.array(z.unknown()),
            nextCursor: z.string().nullable(),
          }),
          endpoint: 'movimentacao',
          bearerToken: token,
          signal,
        });
        return {
          items: this.options.mapper.mapMovements(data.items),
          nextCursor: data.nextCursor,
        } satisfies B3Page<B3MovementRecord>;
      },
      { maxPages: this.options.config.maxPages },
    );
    const { sourceAsOf } = await this.readSourceAsOf(token, signal);
    return {
      asOf: sourceAsOf,
      records: collected.items,
      partial: collected.truncated,
    };
  }

  async getProvisionedEvents(signal?: AbortSignal): Promise<SimulatedB3Page<B3MovementRecord>> {
    const token = await this.options.tokens.getToken(signal);
    const { data } = await this.options.client.request({
      path: '/investidor/eventos-provisionados',
      query: {},
      responseSchema: z.object({ items: z.array(z.unknown()) }),
      endpoint: 'eventos-provisionados',
      bearerToken: token,
      signal,
    });
    const { sourceAsOf } = await this.readSourceAsOf(token, signal);
    return {
      asOf: sourceAsOf,
      records: this.options.mapper.mapProvisionedEvents(data.items),
      partial: false,
    };
  }

  async getPositions(signal?: AbortSignal): Promise<SimulatedB3Page<B3PositionSnapshotRow>> {
    const token = await this.options.tokens.getToken(signal);
    const { data } = await this.options.client.request({
      path: '/investidor/posicao',
      query: {},
      responseSchema: z.object({ items: z.array(z.unknown()) }),
      endpoint: 'posicao',
      bearerToken: token,
      signal,
    });
    const { sourceAsOf } = await this.readSourceAsOf(token, signal);
    return {
      asOf: sourceAsOf,
      records: this.options.mapper.mapPositions(data.items),
      partial: false,
    };
  }

  private async readSourceAsOf(
    token: string,
    signal?: AbortSignal,
  ): Promise<{ sourceAsOf: string }> {
    const { data } = await this.options.client.request({
      path: '/investidor/fintech-sistema',
      query: {},
      responseSchema: B3FintechSystemSchema,
      endpoint: 'fintech-sistema',
      bearerToken: token,
      signal,
    });
    return resolveSourceAsOf(data.lastLoadDate);
  }
}

// Re-exported so the synchronous 5M contract stays untouched and visible.
export type { B3SyncSourceProvider };
