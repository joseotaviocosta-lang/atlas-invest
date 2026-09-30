import type { TaxCompensationElectionRow } from '@atlas/database';
import type { TaxCompensationElectionValue } from '@atlas/tax-engine';

/** Canonical election type for exempt-month normal-loss recognition (Phase 4G.2A). */
export const EQUITY_EXEMPT_LOSS_ELECTION_TYPE = 'EQUITY_NORMAL_EXEMPT_MONTH_LOSS_RECOGNITION';

export type TaxCompensationElectionStatus = 'MISSING' | 'DECLARED' | 'NOT_DECLARED';

export interface TaxCompensationElectionReadModel {
  readonly competence: string;
  readonly electionType: string;
  readonly status: TaxCompensationElectionStatus;
  readonly current: {
    readonly value: TaxCompensationElectionValue;
    readonly version: number;
    readonly source: string;
    readonly fingerprint: string;
    readonly supersedesId: string | null;
    readonly createdAt: string;
  } | null;
}

function statusOf(value: string): TaxCompensationElectionStatus {
  return value === 'DECLARE_FOR_CARRYFORWARD' ? 'DECLARED' : 'NOT_DECLARED';
}

export function mapTaxCompensationElectionToReadModel(
  competence: string,
  row: TaxCompensationElectionRow | null,
): TaxCompensationElectionReadModel {
  if (!row) {
    return {
      competence,
      electionType: EQUITY_EXEMPT_LOSS_ELECTION_TYPE,
      status: 'MISSING',
      current: null,
    };
  }
  return {
    competence,
    electionType: EQUITY_EXEMPT_LOSS_ELECTION_TYPE,
    status: statusOf(row.value),
    current: {
      value: row.value as TaxCompensationElectionValue,
      version: row.version,
      source: row.source,
      fingerprint: row.fingerprint,
      supersedesId: row.supersedesId,
      createdAt: row.createdAt.toISOString(),
    },
  };
}
