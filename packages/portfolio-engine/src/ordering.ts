import { Transaction } from '@atlas/domain';

/**
 * Canonical sorting function for Transaction Ledger events.
 *
 * Implements the deterministic 3-tuple ordering:
 * 1. tradeDate ASC (economic date via LocalDate comparison)
 * 2. createdAt ASC (physical registration timestamp)
 * 3. id ASC (lexicographical tie-breaker)
 *
 * Guarantees that replay order is strictly independent of array input order.
 */
export function compareTransactionsChronologically(a: Transaction, b: Transaction): number {
  // 1. Primary sort: tradeDate ASC
  const dateComp = a.tradeDate.compare(b.tradeDate);
  if (dateComp !== 0) {
    return dateComp;
  }

  // 2. Secondary sort: createdAt ASC
  const timeA =
    a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
  const timeB =
    b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
  if (timeA !== timeB) {
    return timeA < timeB ? -1 : 1;
  }

  // 3. Deterministic tie-breaker: transaction id ASC
  const idA = String(a.id);
  const idB = String(b.id);
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}
