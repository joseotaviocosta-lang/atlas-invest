/**
 * Phase 4C.2 — deterministic fiscal clock.
 *
 * Overdue/current-competence semantics must be reproducible in tests, so the
 * domain never calls `new Date()` directly. The clock exposes a civil date-only
 * value (`YYYY-MM-DD`), immune to timezone drift.
 */
export interface FiscalClock {
  /** Current civil date in canonical `YYYY-MM-DD` (UTC-based). */
  today(): string;
}

export class SystemFiscalClock implements FiscalClock {
  today(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
