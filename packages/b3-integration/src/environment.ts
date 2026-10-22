/**
 * Phase 5O-B — B3 integration mode model (explicit, default-safe).
 *
 * Separate from product availability (`B3IntegrationAvailability` in
 * `@atlas/ui`) and from connection runtime state (`SyncState`): this is the
 * deployment posture of the B3 transport. A plain Atlas installation is
 * `DISABLED` and can never reach B3. `NODE_ENV` is never consulted: only an
 * explicit `mode` value moves the posture, and `CERT`/`PROD` additionally
 * require a validated config (see `config.ts`).
 */
export const B3_INTEGRATION_MODES = ['DISABLED', 'SIMULATED', 'CERT', 'PROD'] as const;
export type B3IntegrationMode = (typeof B3_INTEGRATION_MODES)[number];

export interface B3ModeInput {
  mode?: unknown;
}

/**
 * Resolves the transport posture. Anything that is not an exact, recognized
 * mode string resolves to `DISABLED` — including `undefined`, booleans,
 * empty strings and unknown values. Case-sensitive by design: modes are
 * machine vocabulary, never user copy.
 */
export function resolveB3IntegrationMode(input: B3ModeInput = {}): B3IntegrationMode {
  switch (input.mode) {
    case 'SIMULATED':
      return 'SIMULATED';
    case 'CERT':
      return 'CERT';
    case 'PROD':
      return 'PROD';
    default:
      return 'DISABLED';
  }
}
