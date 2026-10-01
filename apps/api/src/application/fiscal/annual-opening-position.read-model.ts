import { AnnualOpeningPositionRow } from '@atlas/database';

export interface AnnualOpeningPositionReadModel {
  readonly id: string;
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly effectiveDate: string;
  readonly quantity: string;
  readonly totalHistoricalCost: string;
  readonly currency: string;
  readonly source: string;
  readonly status: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly notes: string | null;
  readonly supersedesId: string | null;
  readonly confirmedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function formatDateOnly(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mapAnnualOpeningPositionToReadModel(
  row: AnnualOpeningPositionRow,
): AnnualOpeningPositionReadModel {
  return {
    id: row.id,
    taxSubjectId: row.taxSubjectId,
    portfolioId: row.portfolioId,
    accountId: row.accountId,
    assetId: row.assetId,
    effectiveDate: formatDateOnly(row.effectiveDate),
    quantity: row.quantity,
    totalHistoricalCost: row.totalHistoricalCost,
    currency: row.currency,
    source: row.source,
    status: row.status,
    revision: row.revision,
    fingerprint: row.fingerprint,
    notes: row.notes,
    supersedesId: row.supersedesId,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
