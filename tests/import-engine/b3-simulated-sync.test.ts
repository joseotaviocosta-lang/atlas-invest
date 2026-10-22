import { describe, it, expect } from 'vitest';
import {
  SimulatedB3Provider,
  runSimulatedB3Sync,
  selectImportableCandidates,
  SimulatedB3SyncBlockedError,
  SimulatedB3ProviderError,
  normalizeB3Movement,
  canonicalFingerprint,
  toLedgerSnapshotRow,
  transitionSyncState,
  InvalidSyncTransitionError,
  type B3MovementRecord,
  type B3SyncSourceProvider,
  type ClassifiedCandidate,
  type ExistingLedgerRow,
  type LedgerPositionRow,
} from '@atlas/import-engine';
import { TransactionFactory } from '@atlas/domain';
import {
  PORTFOLIO_5M,
  ACCOUNT_A_5M,
  ACCOUNT_B_5M,
  ASSET_PETR4_5M,
  ASSET_VALE3_5M,
  ASSET_HGLG11_5M,
  ASSETS_5M,
  ACCOUNTS_5M,
  TODAY_5M,
} from './fixtures/b3-simulated-sync';

const OPTIONS = { today: TODAY_5M, defaultCurrency: 'BRL' };

function syncInput(
  overrides: Partial<Parameters<typeof runSimulatedB3Sync>[0]> = {},
): Parameters<typeof runSimulatedB3Sync>[0] {
  return {
    syncState: 'AUTHORIZED',
    provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_1' }),
    portfolioId: PORTFOLIO_5M,
    assets: ASSETS_5M,
    accounts: ACCOUNTS_5M,
    defaultAccountId: ACCOUNT_A_5M,
    existing: [],
    ledgerPositions: [],
    today: TODAY_5M,
    lastSuccessfulSyncAt: null,
    ...overrides,
  };
}

/**
 * Confirms classified candidates the way the real writer path does: every
 * importable row must map onto a canonical domain Transaction (real
 * decimal/date validation, zero floats) and is then appended to the
 * in-memory ledger stub standing in for the append-only table.
 */
function confirmIntoStub(
  candidates: ClassifiedCandidate[],
  stub: ExistingLedgerRow[],
): { created: number; transferGroupIds: string[] } {
  let created = 0;
  const transferGroupIds: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.assetId || !candidate.accountId) continue;
    const common = {
      portfolioId: PORTFOLIO_5M,
      accountId: candidate.accountId,
      assetId: candidate.assetId,
      currency: candidate.currency,
      tradeDate: candidate.tradeDate,
      ...(candidate.settlementDate ? { settlementDate: candidate.settlementDate } : {}),
      source: 'B3',
      provider: candidate.provider,
      ...(candidate.externalId ? { externalId: candidate.externalId } : {}),
    } as const;
    if (candidate.operation === 'BUY') {
      TransactionFactory.createBuy({
        ...common,
        quantity: candidate.quantity,
        unitPrice: candidate.unitPrice,
      });
    } else if (candidate.operation === 'SELL') {
      TransactionFactory.createSell({
        ...common,
        quantity: candidate.quantity,
        unitPrice: candidate.unitPrice,
      });
    } else {
      const tx = TransactionFactory.createTransfer({
        ...common,
        type: candidate.operation,
        quantity: candidate.quantity,
        ...(candidate.transferGroupId ? { transferGroupId: candidate.transferGroupId } : {}),
      });
      if ('transferGroupId' in tx && typeof tx.transferGroupId === 'string') {
        transferGroupIds.push(tx.transferGroupId);
      }
    }
    const row = toLedgerSnapshotRow(candidate.provider, {
      assetId: candidate.assetId,
      accountId: candidate.accountId,
      operation: candidate.operation,
      tradeDate: candidate.tradeDate,
      quantity: candidate.quantity,
      unitPrice: candidate.unitPrice,
      fees: candidate.fees,
      currency: candidate.currency,
      externalId: candidate.externalId ?? null,
      fingerprint: candidate.fingerprint,
    });
    expect(row).not.toBeNull();
    stub.push(row!);
    created += 1;
  }
  return { created, transferGroupIds };
}

function ledgerPositionsAfterConfirm(): LedgerPositionRow[] {
  // Snapshot-2 consolidated outcome of the deterministic dataset:
  // PETR4 100 + 20 (transfer legs net to zero), VALE3 50 - 10, HGLG11 10.
  return [
    { assetId: ASSET_PETR4_5M, ticker: 'PETR4', quantity: '120' },
    { assetId: ASSET_VALE3_5M, ticker: 'VALE3', quantity: '40' },
    { assetId: ASSET_HGLG11_5M, ticker: 'HGLG11', quantity: '10' },
  ];
}

describe('Phase 5M: simulated B3 sync end-to-end (real pipeline, mock source)', () => {
  it('1: authorization walks NOT_CONNECTED -> AUTHORIZED -> SYNCING -> SYNCED', () => {
    expect(transitionSyncState('NOT_CONNECTED', 'CONNECT_REQUESTED')).toBe(
      'AWAITING_AUTHORIZATION',
    );
    expect(transitionSyncState('AWAITING_AUTHORIZATION', 'AUTHORIZED')).toBe('AUTHORIZED');
    expect(transitionSyncState('AUTHORIZED', 'SYNC_STARTED')).toBe('SYNCING');
    expect(transitionSyncState('SYNCING', 'SYNC_SUCCEEDED')).toBe('SYNCED');
  });

  it('2: revoked / reauthorization / disconnected states fail closed before any fetch', () => {
    for (const state of [
      'REVOKED',
      'REQUIRES_REAUTHORIZATION',
      'NOT_CONNECTED',
      'ERROR',
    ] as const) {
      expect(() => runSimulatedB3Sync(syncInput({ syncState: state }))).toThrow(
        SimulatedB3SyncBlockedError,
      );
    }
    const revokedProvider = new SimulatedB3Provider({ authorizationStatus: 'REVOKED' });
    expect(() => runSimulatedB3Sync(syncInput({ provider: revokedProvider }))).toThrow(
      expect.objectContaining({ code: 'B3_SIMULATED.SYNC_BLOCKED' }),
    );
    expect(transitionSyncState('AUTHORIZED', 'TOKEN_EXPIRED')).toBe('REQUIRES_REAUTHORIZATION');
    expect(transitionSyncState('AUTHORIZED', 'REVOKED')).toBe('REVOKED');
    expect(() => transitionSyncState('REVOKED', 'SYNC_STARTED')).toThrow(
      InvalidSyncTransitionError,
    );
  });

  it('3: initial sync fetches, normalizes and classifies through the real pipeline', () => {
    const result = runSimulatedB3Sync(syncInput());
    expect(result.recordsFetched).toBe(5);
    expect(result.movementRecords).toBe(3);
    expect(result.provisionedRecords).toBe(2);
    expect(result.normalized).toBe(5);
    expect(result.newCandidates).toBe(3);
    expect(result.exactDuplicates).toBe(0);
    expect(result.unsupported).toBe(2);
    expect(result.invalid).toBe(0);
    expect(result.sourceAsOf).toBe('2026-04-30');
    expect(result.recommendedEvent).toBe('SYNC_SUCCEEDED');
    expect(result.partial).toBe(false);
    // Nothing imported yet: snapshot rows are all missing locally.
    expect(result.reconciliation.summary).toMatchObject({ missingLocal: 3 });
    expect(result.reconciliation.status).toBe('INCOMPLETE');
  });

  it('4: preview is zero-write (frozen inputs untouched, provider records intact)', () => {
    const existing: ExistingLedgerRow[] = [];
    const ledgerPositions: LedgerPositionRow[] = [];
    const frozenExisting = Object.freeze([...existing]);
    const input = syncInput({ existing: frozenExisting, ledgerPositions });
    const before = JSON.stringify(input.provider.getMovements().records);
    const result = runSimulatedB3Sync(input);
    expect(input.existing).toHaveLength(0);
    expect(input.ledgerPositions).toHaveLength(0);
    expect(JSON.stringify(input.provider.getMovements().records)).toBe(before);
    expect(result.candidates).toHaveLength(5);
  });

  it('5-6: confirm maps importable rows onto canonical domain transactions (3 events)', () => {
    const result = runSimulatedB3Sync(syncInput());
    const importable = selectImportableCandidates(result);
    expect(importable).toHaveLength(3);
    const stub: ExistingLedgerRow[] = [];
    const { created } = confirmIntoStub(importable, stub);
    expect(created).toBe(3);
    expect(stub).toHaveLength(3);
    for (const row of stub) {
      expect(row.provider).toBe('B3');
      expect(row.externalId).toMatch(/^B3-5M-000[123]$/);
      expect(row.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('7: repeated sync over the same snapshot produces zero duplicate writes', () => {
    const first = runSimulatedB3Sync(syncInput());
    const stub: ExistingLedgerRow[] = [];
    const { created } = confirmIntoStub(selectImportableCandidates(first), stub);
    expect(created).toBe(3);
    const second = runSimulatedB3Sync(syncInput({ existing: stub }));
    expect(second.newCandidates).toBe(0);
    expect(second.exactDuplicates).toBe(3);
    expect(selectImportableCandidates(second)).toHaveLength(0);
  });

  it('8: incremental sync imports only the new events (2 trades + transfer pair)', () => {
    const first = runSimulatedB3Sync(syncInput());
    const stub: ExistingLedgerRow[] = [];
    confirmIntoStub(selectImportableCandidates(first), stub);

    const incremental = runSimulatedB3Sync(
      syncInput({ provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' }), existing: stub }),
    );
    expect(incremental.recordsFetched).toBe(9);
    expect(incremental.newCandidates).toBe(4);
    expect(
      selectImportableCandidates(incremental)
        .map((c) => c.externalId)
        .sort(),
    ).toEqual(['B3-5M-0006', 'B3-5M-0007', 'B3-5M-0008-IN', 'B3-5M-0008-OUT']);
    const { created, transferGroupIds } = confirmIntoStub(
      selectImportableCandidates(incremental),
      stub,
    );
    expect(created).toBe(4);
    expect(transferGroupIds).toEqual(['B3-5M-TRF-001', 'B3-5M-TRF-001']);
    expect(stub).toHaveLength(7);
  });

  it('9: third identical sync is fully idempotent (zero new candidates, zero writes)', () => {
    const stub: ExistingLedgerRow[] = [];
    const provider = new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' });
    const first = runSimulatedB3Sync(syncInput({ provider, existing: stub }));
    confirmIntoStub(selectImportableCandidates(first), stub);
    const before = stub.length;
    const second = runSimulatedB3Sync(syncInput({ provider, existing: stub }));
    confirmIntoStub(selectImportableCandidates(second), stub);
    const third = runSimulatedB3Sync(syncInput({ provider, existing: stub }));
    expect(third.newCandidates).toBe(0);
    expect(selectImportableCandidates(third)).toHaveLength(0);
    expect(stub.length).toBe(before);
    expect(third.summary.duplicates).toBeGreaterThan(0);
  });

  it('10: ledger reconciles MATCHED after confirming both snapshots', () => {
    const result = runSimulatedB3Sync(
      syncInput({
        provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' }),
        ledgerPositions: ledgerPositionsAfterConfirm(),
      }),
    );
    expect(result.reconciliation.summary).toEqual({
      totalAssets: 3,
      matched: 3,
      divergent: 0,
      missingLocal: 0,
      missingSource: 0,
      unresolved: 0,
    });
    expect(result.reconciliation.status).toBe('MATCHED');
    expect(result.reconciliation.entries.every((e) => e.delta === '0')).toBe(true);
  });

  it('11-12: divergent snapshot reports +5 and never auto-mutates the ledger', () => {
    const stub: ExistingLedgerRow[] = [];
    const before = JSON.stringify(stub);
    const drifted: LedgerPositionRow[] = [
      { assetId: ASSET_PETR4_5M, ticker: 'PETR4', quantity: '120' },
      { assetId: ASSET_VALE3_5M, ticker: 'VALE3', quantity: '40' },
      { assetId: ASSET_HGLG11_5M, ticker: 'HGLG11', quantity: '10' },
    ];
    const result = runSimulatedB3Sync(
      syncInput({
        provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' }),
        existing: stub,
        // Ledger holds 120 PETR4 but the source snapshot claims 125.
        ledgerPositions: drifted.map((row) =>
          row.assetId === ASSET_PETR4_5M ? { ...row, quantity: '115' } : row,
        ),
      }),
    );
    const petr = result.reconciliation.entries.find((e) => e.assetId === ASSET_PETR4_5M);
    expect(petr?.status).toBe('DIVERGENT');
    expect(petr?.delta).toBe('5');
    expect(result.reconciliation.status).toBe('DIVERGENT');
    // No auto-correction: no invented rows, stub untouched, no CUSTODY_ADJUSTMENT.
    expect(JSON.stringify(stub)).toBe(before);
    expect(result.candidates.every((c) => c.operation !== 'DEPOSIT')).toBe(true);
  });

  it('13: CSV import then identical B3 trade classifies EXACT_DUPLICATE (no double ledger)', () => {
    const csvRow: ExistingLedgerRow = {
      provider: 'CSV',
      externalId: 'NEG-5M-1',
      assetId: ASSET_PETR4_5M,
      accountId: ACCOUNT_A_5M,
      type: 'BUY',
      tradeDate: '2026-03-10',
      quantity: '100',
      unitPrice: '30.00',
      fees: null,
      currency: 'BRL',
      fingerprint: canonicalFingerprint({
        portfolioId: PORTFOLIO_5M,
        accountId: ACCOUNT_A_5M,
        assetId: ASSET_PETR4_5M,
        type: 'BUY',
        tradeDate: '2026-03-10',
        quantity: '100',
        unitPrice: '30.00',
        fees: null,
        currency: 'BRL',
      }),
    };
    const result = runSimulatedB3Sync(syncInput({ existing: [csvRow] }));
    const match = result.candidates.find((c) => c.externalId === 'B3-5M-0001');
    expect(match?.duplicate).toBe('EXACT_DUPLICATE');
    expect(match?.status).toBe('DUPLICATE');
    expect(selectImportableCandidates(result).some((c) => c.externalId === 'B3-5M-0001')).toBe(
      false,
    );
  });

  it('14: similar-but-different B3 trade classifies PROBABLE and needs human review', () => {
    const csvRow: ExistingLedgerRow = {
      provider: 'CSV',
      externalId: 'NEG-5M-2',
      assetId: ASSET_PETR4_5M,
      accountId: ACCOUNT_A_5M,
      type: 'BUY',
      tradeDate: '2026-03-10',
      quantity: '100',
      unitPrice: '30.50',
      fees: null,
      currency: 'BRL',
      fingerprint: canonicalFingerprint({
        portfolioId: PORTFOLIO_5M,
        accountId: ACCOUNT_A_5M,
        assetId: ASSET_PETR4_5M,
        type: 'BUY',
        tradeDate: '2026-03-10',
        quantity: '100',
        unitPrice: '30.50',
        fees: null,
        currency: 'BRL',
      }),
    };
    const result = runSimulatedB3Sync(syncInput({ existing: [csvRow] }));
    const match = result.candidates.find((c) => c.externalId === 'B3-5M-0001');
    expect(match?.duplicate).toBe('PROBABLE_DUPLICATE');
    expect(match?.status).toBe('NEEDS_REVIEW');
    // Never auto-merged: not importable without an explicit decision.
    expect(selectImportableCandidates(result).some((c) => c.externalId === 'B3-5M-0001')).toBe(
      false,
    );
    expect(result.probableDuplicates).toBe(1);
  });

  it('15-16: transfer pair preserves transferGroupId and never becomes an acquisition', () => {
    const result = runSimulatedB3Sync(
      syncInput({ provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' }) }),
    );
    const legs = result.candidates
      .filter((c) => c.transferGroupId === 'B3-5M-TRF-001')
      .sort((a, b) => (a.externalId ?? '').localeCompare(b.externalId ?? ''));
    expect(legs.map((c) => c.externalId)).toEqual(['B3-5M-0008-IN', 'B3-5M-0008-OUT']);
    expect(legs.map((c) => c.operation).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    expect(legs.map((c) => c.status)).toEqual(['READY', 'READY']);
    expect(legs[0]?.transferGroupId).toBe(legs[1]?.transferGroupId);
    // No economic duplication: no BUY/SELL carries the pair key, quantities match.
    expect(
      result.candidates.filter(
        (c) => c.transferGroupId && c.operation !== 'TRANSFER_IN' && c.operation !== 'TRANSFER_OUT',
      ),
    ).toHaveLength(0);
    expect(legs.map((c) => c.quantity)).toEqual(['70', '70']);
    const out = legs.find((c) => c.operation === 'TRANSFER_OUT');
    const inn = legs.find((c) => c.operation === 'TRANSFER_IN');
    expect(out?.accountId).toBe(ACCOUNT_A_5M);
    expect(inn?.accountId).toBe(ACCOUNT_B_5M);
  });

  it('17-18: dividend and JCP amounts are preserved exactly and never traded', () => {
    const result = runSimulatedB3Sync(syncInput());
    const dividend = result.candidates.find((c) => c.externalId === 'B3-5M-0004');
    const jcp = result.candidates.find((c) => c.externalId === 'B3-5M-0005');
    expect(dividend?.status).toBe('UNSUPPORTED');
    expect(dividend?.rawOperation).toBe('DIVIDENDO');
    expect(dividend?.amount).toBe('87.30');
    expect(jcp?.status).toBe('UNSUPPORTED');
    expect(jcp?.rawOperation).toBe('JCP');
    expect(jcp?.amount).toBe('42.10');
    // Fail-closed: income rows are never importable as trades.
    expect(selectImportableCandidates(result)).not.toContain(dividend);
    expect(selectImportableCandidates(result)).not.toContain(jcp);
    // Domain ledger preserves the carried amounts when income is in scope.
    // (Money canonicalizes '87.30' to '87.3': same exact value, zero floats.)
    const incomeTx = TransactionFactory.createIncome({
      portfolioId: PORTFOLIO_5M,
      accountId: ACCOUNT_A_5M,
      assetId: ASSET_PETR4_5M,
      currency: 'BRL',
      tradeDate: '2026-04-15',
      type: 'DIVIDEND',
      amount: dividend!.amount!,
    });
    expect(incomeTx.amount.amount).toBe('87.3');
  });

  it('19: unknown movement natures fail closed (INVALID, never invented trades)', () => {
    const unknown: B3MovementRecord = {
      movementId: 'B3-5M-9999',
      nature: 'EVENTO_DESCONHECIDO_XYZ',
      ticker: 'PETR4',
      tradeDate: '2026-06-01',
      quantity: '10',
      currency: 'BRL',
    };
    const candidate = normalizeB3Movement(unknown, 2, OPTIONS);
    expect(candidate.status).toBe('INVALID');
    expect(candidate.issues.map((i) => i.code)).toContain('UNKNOWN_OPERATION');

    const customProvider: B3SyncSourceProvider = {
      getAuthorizationStatus: () => 'AUTHORIZED',
      getMovements: () => ({ asOf: '2026-06-30', records: [unknown], partial: false }),
      getProvisionedEvents: () => ({ asOf: '2026-06-30', records: [], partial: false }),
      getPositions: () => ({ asOf: '2026-06-30', records: [], partial: false }),
    };
    const result = runSimulatedB3Sync(syncInput({ provider: customProvider }));
    expect(result.invalid).toBe(1);
    expect(result.newCandidates).toBe(0);
    expect(selectImportableCandidates(result)).toHaveLength(0);
  });

  it('20: revoked source authorization blocks the sync with zero candidates', () => {
    const provider = new SimulatedB3Provider({ authorizationStatus: 'REVOKED' });
    let blocked: unknown = null;
    try {
      runSimulatedB3Sync(syncInput({ provider }));
    } catch (error) {
      blocked = error;
    }
    expect(blocked).toBeInstanceOf(SimulatedB3SyncBlockedError);
    expect((blocked as SimulatedB3SyncBlockedError).code).toBe('B3_SIMULATED.SYNC_BLOCKED');
  });

  it('21: provider outage surfaces as a typed error (never silent, never partial-writes)', () => {
    const provider = new SimulatedB3Provider({ failure: 'UNAVAILABLE' });
    expect(() => runSimulatedB3Sync(syncInput({ provider }))).toThrow(SimulatedB3ProviderError);
    try {
      runSimulatedB3Sync(syncInput({ provider }));
      expect.unreachable();
    } catch (error) {
      expect((error as SimulatedB3ProviderError).code).toBe('B3_SIMULATED.PROVIDER_UNAVAILABLE');
    }
  });

  it('22: partial source results stay explicitly PARTIAL (never labeled complete)', () => {
    const result = runSimulatedB3Sync(
      syncInput({ provider: new SimulatedB3Provider({ failure: 'PARTIAL_MOVEMENTS' }) }),
    );
    expect(result.partial).toBe(true);
    expect(result.recommendedEvent).toBe('SYNC_PARTIAL');
    expect(result.movementRecords).toBe(1);
    expect(result.reconciliation.status).not.toBe('MATCHED');
  });

  it('23: provenance answers source / provider / externalId for every event', () => {
    const result = runSimulatedB3Sync(
      syncInput({ provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' }) }),
    );
    for (const candidate of selectImportableCandidates(result)) {
      expect(candidate.provider).toBe('B3');
      expect(candidate.externalId).toMatch(/^B3-5M-/);
      expect(candidate.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('24: fixtures and provider carry zero PII, secrets or credentials', async () => {
    const fs = await import('fs');
    for (const file of [
      'tests/import-engine/fixtures/b3-simulated-sync.ts',
      'packages/import-engine/src/b3-simulated.ts',
    ]) {
      const content: string = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      expect(content).not.toMatch(/token\s*[:=]\s*['"][^'"]+['"]/i);
      expect(content).not.toMatch(/secret\s*[:=]\s*['"][^'"]+['"]/i);
      expect(content).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
      expect(content).not.toMatch(/cnpj\s*[:=]/i);
      expect(content).not.toMatch(/mTLS|oauth|client_secret/i);
    }
    expect(fs.readFileSync('tests/import-engine/fixtures/b3-simulated-sync.ts', 'utf8')).toContain(
      'SINTETICA',
    );
  });

  it('25: simulated provider performs zero network access', async () => {
    const fs = await import('fs');
    const source: string = fs.readFileSync('packages/import-engine/src/b3-simulated.ts', 'utf8');
    const fromLines = source.split('\n').filter((line) => line.includes("from '"));
    expect(fromLines.length).toBeGreaterThan(0);
    for (const line of fromLines) {
      expect(line).toMatch(/from '(\.|@atlas\/domain|node:crypto)/);
    }
    expect(source).not.toMatch(/\bfetch\s*\(|\baxios\b|\bundici\b|\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/https?:\/\/[a-z0-9]/i);
    expect(source).not.toMatch(/process\.env|B3_API|privateKey/);
  });
});
