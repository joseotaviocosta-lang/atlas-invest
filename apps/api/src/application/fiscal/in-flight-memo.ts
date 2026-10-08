/**
 * Load-snapshot-scoped de-duplication memo (Phase 4J.1).
 *
 * Phase 4J.1 composes the five annual use-cases, and two of them
 * (`GetAnnualTaxReadinessUseCase`, `GetAnnualHighIncomeAssessmentUseCase`)
 * transitively re-execute the capital-market (4H.3) and investment-income
 * (4H.4) use-cases that the unified service also loads directly. Without
 * de-duplication a single composed load would execute each of those (and their
 * underlying 12-month ledger replays) up to six times, then double again across
 * the outer rebuild-once fence.
 *
 * This memo collapses the identical calls WITHIN ONE composed `load()`
 * snapshot into a single shared promise. Unlike a naive in-flight map it does
 * NOT evict a result when its promise settles — it retains the settled value
 * for the lifetime of the snapshot, so a DELAYED transitive invocation (e.g.
 * high-income waiting for its evidence watermark before calling income) reuses
 * the already-settled result instead of recomputing. The query shape is
 * therefore deterministic (exactly one compute per category per snapshot)
 * rather than timing-dependent.
 *
 * CRITICAL ISOLATION PROPERTIES:
 *   - It is NOT a process-wide / cross-request cache. Each composed `load()`
 *     creates a FRESH scope; the outer fence's after-read creates another fresh
 *     scope. Two different requests (and two different users) never share a
 *     scope, so no derived fiscal state leaks across users and nothing is
 *     persisted.
 *   - Rejections are not retained: a failed load clears its entry so a later
 *     attempt within the same (short-lived) snapshot can retry rather than
 *     being poisoned.
 *   - The memoized function is pure/deterministic for a given key, so sharing a
 *     settled result is semantically transparent — identical to calling it N
 *     times within the snapshot.
 */
export class LoadScopeMemo {
  private readonly entries = new Map<string, Promise<unknown>>();

  /**
   * Return the shared promise for `key` if one exists in this snapshot
   * (pending OR already settled); otherwise invoke `factory`, retain its
   * promise for the snapshot's lifetime, and return it. A rejected promise is
   * evicted so it never poisons a retry within the snapshot.
   */
  run<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }
    const promise = factory().catch((error: unknown) => {
      // Do not retain a rejection for the snapshot's lifetime.
      this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, promise);
    return promise;
  }
}

/**
 * A single composed-load scope threaded through all five annual use-cases so
 * that direct and transitive calls to the capital-market / investment-income
 * use-cases are de-duplicated against one shared snapshot. A fresh scope is
 * created for each `load()` (and separately for the outer fence's after-read),
 * guaranteeing request isolation and a fresh re-read across the fence.
 */
export interface UnifiedLoadScope {
  readonly memo: LoadScopeMemo;
}

/** Create a fresh, isolated load scope. */
export function createUnifiedLoadScope(): UnifiedLoadScope {
  return { memo: new LoadScopeMemo() };
}
