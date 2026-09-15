export const DOMAIN_VERSION = '0.1.0';

/**
 * Result pattern for robust domain operations without throwing unhandled exceptions.
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function fail<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Base entity contract for domain models.
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
