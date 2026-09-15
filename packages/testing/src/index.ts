export const TESTING_VERSION = '0.1.0';

/**
 * Shared test utilities and assertions for Atlas Foundation.
 */
export function assertDefined<T>(val: T | null | undefined, name = 'Value'): asserts val is T {
  if (val === null || val === undefined) {
    throw new Error(`Expected ${name} to be defined, but received ${String(val)}`);
  }
}
