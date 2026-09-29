import type { FederalTaxDeadlineEntry, FederalTaxDeadlineStatus } from '@atlas/tax-engine';

/**
 * Phase 4C.2 — production federal tax deadline registry (direct authority).
 *
 * The canonical, code-level record of the officially verified deadline entries
 * that are seeded into `federal_tax_deadline_entries`. Each entry carries the
 * full official provenance required for audit (ADR-262, ADR-263). Corrections
 * never mutate an entry — a new version is appended and the previous one is
 * marked `SUPERSEDED`.
 *
 * Primary authority: RFB Agenda Tributária + ADE CORAT (DOU). No generic
 * business calendar is reconstructed (ADR-268).
 */
export const PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY: readonly FederalTaxDeadlineEntry[] =
  Object.freeze([
    Object.freeze({
      id: 'f0000000-0000-4000-8000-000000000001',
      revenueCode: '6015',
      taxBucket: 'FII_SALE',
      competence: '2026-08',
      dueDate: '2026-09-30',
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'ADE CORAT nº 63/2026',
      sourceReference:
        'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026/Setembro/dia-30-09-2026',
      sourcePublishedAt: '2026-08-27',
      verifiedAt: '2026-09-28',
      version: 1,
      supersedesEntryId: null,
      metadata: Object.freeze({
        periodicity: 'MENSAL',
        description: 'Ganhos líquidos em operações em bolsa',
        douPublication: '2026-08-27',
      }),
    }),
    Object.freeze({
      id: 'f0000000-0000-4000-8000-000000000002',
      revenueCode: '6015',
      taxBucket: 'FII_SALE',
      competence: '2026-09',
      dueDate: '2026-10-30',
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'ADE CORAT nº 78/2026',
      sourceReference:
        'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026/Outubro/dia-30-10-2026',
      sourcePublishedAt: '2026-09-28',
      verifiedAt: '2026-09-28',
      version: 1,
      supersedesEntryId: null,
      metadata: Object.freeze({
        periodicity: 'MENSAL',
        description: 'Ganhos líquidos em operações em bolsa',
        adjustedFor: 'month-end Saturday (31/10/2026)',
      }),
    }),
    Object.freeze({
      id: 'f0000000-0000-4000-8000-000000000003',
      revenueCode: '6015',
      taxBucket: 'FII_SALE',
      competence: '2025-07',
      dueDate: '2025-08-29',
      status: 'VERIFIED',
      sourceAuthority: 'RFB',
      sourceDocument: 'Agenda Tributária — agosto/2025',
      sourceReference:
        'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2025/agosto/dia-29-08-2025',
      sourcePublishedAt: '2025-08-27',
      verifiedAt: '2026-09-28',
      version: 1,
      supersedesEntryId: null,
      metadata: Object.freeze({
        periodicity: 'MENSAL',
        description: 'Ganhos líquidos em operações em bolsa',
        adjustedFor: 'month-end Saturday+Sunday (30-31/08/2025)',
      }),
    }),
  ]);

export interface FederalTaxDeadlineRowLike {
  id: string;
  revenueCode: string;
  taxBucket: string;
  competence: string;
  dueDate: Date;
  status: string;
  sourceAuthority: string;
  sourceDocument: string;
  sourceReference: string;
  sourcePublishedAt: Date;
  verifiedAt: Date;
  version: number;
  supersedesEntryId: string | null;
  metadata: Record<string, unknown> | null;
}

function isoDate(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Maps a persisted deadline row to the pure engine entry (date-only). */
export function toDomainDeadlineEntry(row: FederalTaxDeadlineRowLike): FederalTaxDeadlineEntry {
  return {
    id: row.id,
    revenueCode: row.revenueCode,
    taxBucket: row.taxBucket,
    competence: row.competence,
    dueDate: isoDate(row.dueDate),
    status: row.status as FederalTaxDeadlineStatus,
    sourceAuthority: row.sourceAuthority,
    sourceDocument: row.sourceDocument,
    sourceReference: row.sourceReference,
    sourcePublishedAt: isoDate(row.sourcePublishedAt),
    verifiedAt: isoDate(row.verifiedAt),
    version: row.version,
    supersedesEntryId: row.supersedesEntryId,
    ...(row.metadata
      ? { metadata: Object.freeze({ ...row.metadata }) as Record<string, string> }
      : {}),
  };
}
