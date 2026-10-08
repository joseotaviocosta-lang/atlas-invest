/**
 * Phase 4J.1 — application-facing port for the unified annual orchestration
 * service.
 *
 * The approved architecture contract (design §12) forbids the unified
 * application service from importing `@atlas/database` row/mapper/error types
 * directly. This port exposes ONLY the narrow contracts the service needs — the
 * portfolio fan-out shape and structural persistence-error predicates — without
 * leaking persistence package types into the use-case. The DI token itself
 * (`PORTFOLIO_REPOSITORY`) is explicitly allowed by the contract; this port
 * types the slice of the repository the service consumes.
 */

/** The minimal portfolio projection the positions fan-out needs. */
export interface UnifiedAnnualPortfolioRef {
  readonly id: string;
}

/**
 * Narrow read-only port over the portfolio repository. The service only ever
 * fans out over the authenticated subject's own portfolios; ownership is
 * enforced transitively by the composed position use-case.
 */
export interface UnifiedAnnualPortfolioPort {
  findByUserId(userId: string): Promise<readonly UnifiedAnnualPortfolioRef[]>;
}

/**
 * Structural predicate: a persistence "entity not found" (recoverable
 * not-found / race). Detected by the stable persistence error code rather than
 * an `instanceof` against the forbidden `@atlas/database` class, so the port
 * carries no persistence-package dependency.
 */
export function isEntityNotFound(error: unknown): boolean {
  return hasPersistenceCode(error, 'PERSISTENCE.ENTITY_NOT_FOUND');
}

/**
 * Structural predicate: a genuine persistence fault (not a recoverable
 * not-found). Any persistence error whose code is in the `PERSISTENCE.*`
 * family and is NOT the entity-not-found variant.
 */
export function isPersistenceFault(error: unknown): boolean {
  if (!isPersistenceError(error)) {
    return false;
  }
  return readPersistenceCode(error) !== 'PERSISTENCE.ENTITY_NOT_FOUND';
}

function isPersistenceError(error: unknown): boolean {
  const code = readPersistenceCode(error);
  return typeof code === 'string' && code.startsWith('PERSISTENCE.');
}

function hasPersistenceCode(error: unknown, code: string): boolean {
  return readPersistenceCode(error) === code;
}

function readPersistenceCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
