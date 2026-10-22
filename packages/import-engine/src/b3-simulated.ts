/**
 * Phase 5M — simulated B3 sync (deterministic, zero network, zero secrets).
 *
 * The mock replaces ONLY the transport / external source. Everything below
 * the source contract runs through the REAL Atlas pipeline:
 *
 * ```text
 * SimulatedB3Provider (this file: in-memory, deterministic)
 *   -> B3SyncSourceProvider contract (capabilities from Phase 5L)
 *   -> normalizeB3Movement (canonical 5K normalization; trades, custody
 *      legs and income events with exact amounts)
 *   -> resolveAsset / resolveAccount (AssetId identity, never ticker)
 *   -> classifyOne (source identity + canonical SHA-256 fingerprint,
 *      value-only identity for income)
 *   -> reconcilePositions (ledger vs snapshot, never rewrites history)
 *   -> SimulatedB3SyncResult (pure read model: preview, zero writes)
 *   -> confirm via CreateTransactionUseCase.executeMany (real writer)
 * ```
 *
 * No network clients, no B3 hosts, no certificates, no tokens,
 * no CPF, no real broker data. All records are 100% fictitious.
 */

import { normalizeB3Movement, type B3MovementRecord } from './b3';
import { classifyOne, summarize } from './classify';
import {
  reconcilePositions,
  type LedgerPositionRow,
  type ReconciliationEntry,
  type ReconciliationSummary,
} from './reconcile';
import { resolveAccount, resolveAsset } from './resolve';
import type { SyncState } from './sync';
import type {
  AccountRef,
  AssetRef,
  ClassifiedCandidate,
  ExistingLedgerRow,
  ImportSummary,
} from './types';

/** States under which a sync is allowed to fetch from the source. */
const SYNCABLE_STATES: readonly SyncState[] = ['AUTHORIZED', 'SYNCED', 'PARTIAL'];

export const SIMULATED_B3_PROVIDER = 'B3' as const;

export class SimulatedB3ProviderError extends Error {
  readonly code = 'B3_SIMULATED.PROVIDER_UNAVAILABLE';
  constructor(message = 'Provedor B3 simulado indisponível') {
    super(message);
    this.name = 'SimulatedB3ProviderError';
  }
}

export class SimulatedB3SyncBlockedError extends Error {
  readonly code = 'B3_SIMULATED.SYNC_BLOCKED';
  constructor(
    public readonly reason:
      'INVALID_SYNC_STATE' | 'SOURCE_NOT_AUTHORIZED' | 'UNKNOWN_MOVEMENT_NATURE',
    message: string,
  ) {
    super(message);
    this.name = 'SimulatedB3SyncBlockedError';
  }
}

/** Envelope returned by every source read (data + staleness metadata). */
export interface SimulatedB3Page<T> {
  asOf: string;
  records: readonly T[];
  partial: boolean;
}

export interface SimulatedB3PositionRow {
  ticker: string;
  quantity: string;
}

/**
 * Minimal source contract a B3 client must implement. The future HTTP
 * client implements this same surface; the orchestrator below never knows
 * whether records came from the network or from memory.
 */
export interface B3SyncSourceProvider {
  getAuthorizationStatus(): SyncState;
  getMovements(): SimulatedB3Page<B3MovementRecord>;
  getProvisionedEvents(): SimulatedB3Page<B3MovementRecord>;
  getPositions(): SimulatedB3Page<SimulatedB3PositionRow>;
}

export type SimulatedB3Scenario = 'SNAPSHOT_1' | 'SNAPSHOT_2';

export type SimulatedB3Failure = 'NONE' | 'UNAVAILABLE' | 'PARTIAL_MOVEMENTS';

export interface SimulatedB3ProviderOptions {
  scenario?: SimulatedB3Scenario;
  failure?: SimulatedB3Failure;
  authorizationStatus?: SyncState;
}

const SYNTHETIC_CUSTODIAN = 'CORRETORA EXEMPLO S.A.';
const SYNTHETIC_ACCOUNT_A = 'CONTA SINTETICA 5M-A';
const SYNTHETIC_ACCOUNT_B = 'CONTA SINTETICA 5M-B';

function baseMovement(
  movementId: string,
  nature: string,
  ticker: string,
  tradeDate: string,
  extra: Partial<B3MovementRecord> & { quantity: string },
): B3MovementRecord {
  return Object.freeze({
    movementId,
    nature,
    ticker,
    tradeDate,
    currency: 'BRL',
    custodianLabel: SYNTHETIC_CUSTODIAN,
    accountLabel: SYNTHETIC_ACCOUNT_A,
    ...extra,
  });
}

/** Snapshot 1: first holdings ever seen from the simulated source. */
function snapshot1Movements(): B3MovementRecord[] {
  return [
    baseMovement('B3-5M-0001', 'COMPRA', 'PETR4', '2026-03-10', {
      settlementDate: '2026-03-12',
      quantity: '100',
      unitPrice: '30,00',
    }),
    baseMovement('B3-5M-0002', 'COMPRA', 'VALE3', '2026-03-11', {
      settlementDate: '2026-03-13',
      quantity: '50',
      unitPrice: '60,00',
    }),
    baseMovement('B3-5M-0003', 'COMPRA', 'HGLG11', '2026-03-12', {
      settlementDate: '2026-03-16',
      quantity: '10',
      unitPrice: '160,00',
    }),
  ];
}

/** Snapshot 1 provisioned income: values carried, never auto-traded. */
function snapshot1Provisioned(): B3MovementRecord[] {
  return [
    baseMovement('B3-5M-0004', 'DIVIDENDO', 'PETR4', '2026-04-15', {
      quantity: '100',
      amount: '87,30',
    }),
    baseMovement('B3-5M-0005', 'JCP', 'VALE3', '2026-04-15', {
      quantity: '50',
      amount: '42,10',
    }),
  ];
}

/**
 * Snapshot 2: every snapshot-1 record again (idempotency proof) plus two
 * new economic events and one mirrored custody-transfer pair (consolidated
 * quantities unchanged by the transfer).
 */
function snapshot2ExtraMovements(): B3MovementRecord[] {
  const pairKey = 'B3-5M-TRF-001';
  return [
    baseMovement('B3-5M-0006', 'COMPRA', 'PETR4', '2026-05-06', {
      settlementDate: '2026-05-08',
      quantity: '20',
      unitPrice: '31,00',
    }),
    baseMovement('B3-5M-0007', 'VENDA', 'VALE3', '2026-05-07', {
      settlementDate: '2026-05-09',
      quantity: '10',
      unitPrice: '62,00',
    }),
    baseMovement('B3-5M-0008-OUT', 'TRANSFERENCIA_SAIDA', 'PETR4', '2026-05-02', {
      quantity: '70',
      accountLabel: SYNTHETIC_ACCOUNT_A,
      pairKey,
    }),
    baseMovement('B3-5M-0008-IN', 'TRANSFERENCIA_ENTRADA', 'PETR4', '2026-05-02', {
      quantity: '70',
      accountLabel: SYNTHETIC_ACCOUNT_B,
      pairKey,
    }),
  ];
}

function snapshotPositions(scenario: SimulatedB3Scenario): {
  asOf: string;
  rows: SimulatedB3PositionRow[];
} {
  if (scenario === 'SNAPSHOT_1') {
    return {
      asOf: '2026-04-30',
      rows: [
        { ticker: 'PETR4', quantity: '100' },
        { ticker: 'VALE3', quantity: '50' },
        { ticker: 'HGLG11', quantity: '10' },
      ],
    };
  }
  return {
    asOf: '2026-05-31',
    rows: [
      { ticker: 'PETR4', quantity: '120' },
      { ticker: 'VALE3', quantity: '40' },
      { ticker: 'HGLG11', quantity: '10' },
    ],
  };
}

/**
 * Deterministic in-memory B3 source. Implements `B3SyncSourceProvider` with
 * fixed fictitious snapshots. Failure injection is explicit and typed —
 * never a real socket, timeout or credential error.
 */
export class SimulatedB3Provider implements B3SyncSourceProvider {
  private readonly scenario: SimulatedB3Scenario;
  private readonly failure: SimulatedB3Failure;
  private readonly authorizationStatus: SyncState;

  constructor(options: SimulatedB3ProviderOptions = {}) {
    this.scenario = options.scenario ?? 'SNAPSHOT_1';
    this.failure = options.failure ?? 'NONE';
    this.authorizationStatus = options.authorizationStatus ?? 'AUTHORIZED';
  }

  getAuthorizationStatus(): SyncState {
    return this.authorizationStatus;
  }

  getMovements(): SimulatedB3Page<B3MovementRecord> {
    if (this.failure === 'UNAVAILABLE') {
      throw new SimulatedB3ProviderError();
    }
    const records =
      this.scenario === 'SNAPSHOT_1'
        ? snapshot1Movements()
        : [...snapshot1Movements(), ...snapshot2ExtraMovements()];
    if (this.failure === 'PARTIAL_MOVEMENTS') {
      return Object.freeze({
        asOf: this.scenario === 'SNAPSHOT_1' ? '2026-04-30' : '2026-05-31',
        records: Object.freeze(records.slice(0, 1)),
        partial: true,
      });
    }
    return Object.freeze({
      asOf: this.scenario === 'SNAPSHOT_1' ? '2026-04-30' : '2026-05-31',
      records: Object.freeze([...records]),
      partial: false,
    });
  }

  getProvisionedEvents(): SimulatedB3Page<B3MovementRecord> {
    if (this.failure === 'UNAVAILABLE') {
      throw new SimulatedB3ProviderError();
    }
    return Object.freeze({
      asOf: this.scenario === 'SNAPSHOT_1' ? '2026-04-30' : '2026-05-31',
      records: Object.freeze(snapshot1Provisioned()),
      partial: false,
    });
  }

  getPositions(): SimulatedB3Page<SimulatedB3PositionRow> {
    if (this.failure === 'UNAVAILABLE') {
      throw new SimulatedB3ProviderError();
    }
    const snapshot = snapshotPositions(this.scenario);
    return Object.freeze({
      asOf: snapshot.asOf,
      records: Object.freeze(snapshot.rows.map((row) => Object.freeze({ ...row }))),
      partial: false,
    });
  }
}

export interface SimulatedB3SyncInput {
  /** Current authorization/sync state (state machine is authoritative). */
  syncState: SyncState;
  provider: B3SyncSourceProvider;
  portfolioId: string;
  assets: AssetRef[];
  accounts: AccountRef[];
  defaultAccountId: string | null;
  /** Ledger snapshot for cross-sync dedupe (source identity + fingerprint). */
  existing: ExistingLedgerRow[];
  /** Ledger-derived consolidated positions for reconciliation. */
  ledgerPositions: LedgerPositionRow[];
  today: string;
  /** Previous successful sync instant (null when never synced). Pure echo. */
  lastSuccessfulSyncAt: string | null;
}

export type SimulatedB3ReconciliationStatus = 'MATCHED' | 'DIVERGENT' | 'INCOMPLETE';

export interface SimulatedB3SyncResult {
  scenario: string;
  syncState: SyncState;
  recommendedEvent: 'SYNC_SUCCEEDED' | 'SYNC_PARTIAL';
  partial: boolean;
  sourceAsOf: string;
  lastSuccessfulSyncAt: string | null;
  recordsFetched: number;
  movementRecords: number;
  provisionedRecords: number;
  normalized: number;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  summary: ImportSummary;
  candidates: readonly ClassifiedCandidate[];
  reconciliation: {
    entries: readonly ReconciliationEntry[];
    summary: ReconciliationSummary;
    status: SimulatedB3ReconciliationStatus;
  };
  unresolvedSnapshotTickers: readonly string[];
}

function isSyncable(state: SyncState): boolean {
  return (SYNCABLE_STATES as readonly string[]).includes(state);
}

/**
 * Runs one simulated B3 sync through the real pipeline. Pure and zero-write:
 * normalizes via `normalizeB3Movement`, classifies via `classifyOne`,
 * reconciles via `reconcilePositions`. Fail-closed on any unauthorized
 * state; unknown movement natures surface as INVALID/UNSUPPORTED rows and
 * never as invented trades.
 */
export function runSimulatedB3Sync(input: SimulatedB3SyncInput): SimulatedB3SyncResult {
  if (!isSyncable(input.syncState)) {
    throw new SimulatedB3SyncBlockedError(
      'INVALID_SYNC_STATE',
      `Sincronização bloqueada no estado "${input.syncState}": autorize a fonte antes de sincronizar`,
    );
  }
  const sourceStatus = input.provider.getAuthorizationStatus();
  if (!isSyncable(sourceStatus)) {
    throw new SimulatedB3SyncBlockedError(
      'SOURCE_NOT_AUTHORIZED',
      `Fonte B3 simulada não autorizada (estado "${sourceStatus}")`,
    );
  }

  const movements = input.provider.getMovements();
  const provisioned = input.provider.getProvisionedEvents();
  const positions = input.provider.getPositions();
  const partial = movements.partial || provisioned.partial || positions.partial;

  const allRecords = [...movements.records, ...provisioned.records];
  const candidates = allRecords.map((record, index) => {
    const normalized = normalizeB3Movement(record, index + 2, {
      today: input.today,
      defaultCurrency: 'BRL',
    });
    return classifyOne({
      portfolioId: input.portfolioId,
      provider: SIMULATED_B3_PROVIDER,
      candidate: normalized,
      assetMatch: resolveAsset(normalized.ticker, input.assets),
      accountMatch: resolveAccount(normalized.accountLabel, input.accounts),
      defaultAccountId: input.defaultAccountId,
      existing: input.existing,
    });
  });

  let newCandidates = 0;
  let exactDuplicates = 0;
  let probableDuplicates = 0;
  let conflicts = 0;
  let unsupported = 0;
  let invalid = 0;
  for (const candidate of candidates) {
    if (candidate.status === 'READY') newCandidates += 1;
    if (candidate.duplicate === 'EXACT_DUPLICATE') exactDuplicates += 1;
    if (candidate.duplicate === 'PROBABLE_DUPLICATE') probableDuplicates += 1;
    if (candidate.duplicate === 'CONFLICT') conflicts += 1;
    if (candidate.status === 'UNSUPPORTED') unsupported += 1;
    if (candidate.status === 'INVALID') invalid += 1;
  }

  const unresolvedSnapshotTickers: string[] = [];
  const snapshotRows = positions.records.flatMap((row) => {
    const match = resolveAsset(row.ticker, input.assets);
    if (match.resolution !== 'RESOLVED' || !match.asset) {
      unresolvedSnapshotTickers.push(row.ticker);
      return [];
    }
    return [
      {
        assetId: match.asset.id,
        ticker: row.ticker,
        quantity: row.quantity,
        asOf: positions.asOf,
      },
    ];
  });
  const reconciliation = reconcilePositions(input.ledgerPositions, snapshotRows);
  const reconciliationStatus: SimulatedB3ReconciliationStatus =
    reconciliation.summary.divergent > 0
      ? 'DIVERGENT'
      : reconciliation.summary.missingLocal > 0 ||
          reconciliation.summary.missingSource > 0 ||
          reconciliation.summary.unresolved > 0 ||
          unresolvedSnapshotTickers.length > 0 ||
          partial
        ? 'INCOMPLETE'
        : 'MATCHED';

  return Object.freeze({
    scenario: 'SIMULATED_B3',
    syncState: input.syncState,
    recommendedEvent: partial ? 'SYNC_PARTIAL' : 'SYNC_SUCCEEDED',
    partial,
    sourceAsOf: positions.asOf,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    recordsFetched: allRecords.length,
    movementRecords: movements.records.length,
    provisionedRecords: provisioned.records.length,
    normalized: candidates.length,
    newCandidates,
    exactDuplicates,
    probableDuplicates,
    conflicts,
    unsupported,
    invalid,
    summary: summarize(candidates),
    candidates: Object.freeze([...candidates]),
    reconciliation: {
      entries: reconciliation.entries,
      summary: reconciliation.summary,
      status: reconciliationStatus,
    },
    unresolvedSnapshotTickers: Object.freeze([...unresolvedSnapshotTickers].sort()),
  });
}

/**
 * Selects the rows a confirm step may write: READY rows only. Duplicates,
 * conflicts, unsupported and invalid rows are never auto-written; probable
 * duplicates require an explicit human decision upstream.
 */
export function selectImportableCandidates(result: SimulatedB3SyncResult): ClassifiedCandidate[] {
  return result.candidates.filter((candidate) => candidate.status === 'READY');
}
