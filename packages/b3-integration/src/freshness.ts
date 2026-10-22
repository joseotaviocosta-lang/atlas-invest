import { B3TransportError } from './errors';

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Phase 5O-B — source freshness (FintechSistema authority).
 *
 * `sourceAsOf` is the B3 load date: the day whose close the returned data
 * reflects (D-1 semantics). `lastSuccessfulSyncAt` is the Atlas-side instant
 * a sync completed. They are never the same concept and must never be
 * conflated in copy or in code: staleness questions are answered by the
 * former, pipeline health by the latter.
 */
export function resolveSourceAsOf(loadDate: string): { sourceAsOf: string } {
  const trimmed = loadDate.trim();
  if (!CIVIL_DATE_PATTERN.test(trimmed)) {
    throw new B3TransportError(
      'INVALID_UPSTREAM_PAYLOAD',
      `FintechSistema load date is not a civil date: "${loadDate}"`,
    );
  }
  return { sourceAsOf: trimmed };
}
