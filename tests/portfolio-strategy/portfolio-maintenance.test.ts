import { describe, expect, it } from 'vitest';
import {
  deriveMaintenanceAction,
  isMaintenanceStatus,
  MAINTENANCE_ACTION_TYPES,
  MAINTENANCE_STATUSES,
} from '@atlas/portfolio-strategy';

/**
 * Phase 5S-D — maintenance actionability policy matrix.
 *
 * Every 5R-E issue code has an explicit classification; the policy is
 * pure and deterministic. No fix-all, no scores, no automatic fix.
 */
describe('Phase 5S-D: maintenance actionability policy', () => {
  it('exposes a closed status and action vocabulary', () => {
    expect([...MAINTENANCE_STATUSES].sort()).toEqual(
      ['ACTIONABLE', 'NAVIGABLE', 'STRUCTURAL', 'UNSUPPORTED'].sort(),
    );
    expect(MAINTENANCE_ACTION_TYPES).not.toContain('RECTIFY_TRANSACTION');
    expect(MAINTENANCE_ACTION_TYPES).not.toContain('MANUAL_MARKET_DATA');
    expect(MAINTENANCE_ACTION_TYPES).not.toContain('EDIT_ASSET_METADATA');
    for (const status of MAINTENANCE_STATUSES) {
      expect(isMaintenanceStatus(status)).toBe(true);
    }
    expect(isMaintenanceStatus('FIX_ALL')).toBe(false);
  });

  it('routes market-data refresh through the existing provider path only', () => {
    const missing = deriveMaintenanceAction('MISSING_PRICE');
    expect(missing.status).toBe('ACTIONABLE');
    expect(missing.actionType).toBe('REFRESH_MARKET_DATA');
    expect(missing.route).toBe('/market');
    expect(missing.safetyNote).toMatch(/nunca fabrica/i);

    const stale = deriveMaintenanceAction('STALE_PRICE');
    expect(stale.status).toBe('NAVIGABLE');
    expect(stale.actionType).toBe('VIEW_MARKET_DATA');
  });

  it('never offers direct cost-basis edits or inferred root transactions', () => {
    const action = deriveMaintenanceAction('INCOMPLETE_COST_BASIS');
    expect(action.status).toBe('NAVIGABLE');
    expect(action.actionType).toBe('VIEW_OPERATIONS');
    expect(action.safetyNote).toMatch(/nunca é editado diretamente/i);
    // No issue may resolve to a transaction mutation from this policy:
    // root-cause identity is never fabricated.
    for (const code of ['MISSING_PRICE', 'STALE_PRICE', 'INCOMPLETE_COST_BASIS']) {
      expect(deriveMaintenanceAction(code).actionType).not.toBe('RECTIFY_TRANSACTION');
    }
  });

  it('keeps FX manual fabrication out of reach', () => {
    const fx = deriveMaintenanceAction('NO_FX_TRANSLATION');
    expect(fx.status).toBe('ACTIONABLE');
    expect(fx.actionType).toBe('REFRESH_FX_DATA');
    expect(fx.safetyNote).toMatch(/nunca são preenchidas com a cotação atual/i);
    expect(deriveMaintenanceAction('MIXED_CURRENCIES_WITHOUT_TRANSLATION').status).toBe(
      'NAVIGABLE',
    );
  });

  it('reuses the 5S-B reconciliation workspace for reconciliation issues', () => {
    for (const code of [
      'RECONCILIATION_DIVERGENT',
      'RECONCILIATION_MISSING_LOCAL',
      'RECONCILIATION_MISSING_SOURCE',
      'RECONCILIATION_UNRESOLVED',
    ]) {
      const action = deriveMaintenanceAction(code);
      expect(action.status).toBe('NAVIGABLE');
      expect(action.actionType).toBe('REVIEW_RECONCILIATION');
      expect(action.route).toContain('/reviews');
    }
    expect(deriveMaintenanceAction('PENDING_INTEGRATION_REVIEW').actionType).toBe('VIEW_REVIEWS');
  });

  it('marks classification gaps structural without inference', () => {
    for (const code of [
      'ISSUER_CLASSIFICATION_NOT_AVAILABLE',
      'SECTOR_CLASSIFICATION_NOT_AVAILABLE',
    ]) {
      const action = deriveMaintenanceAction(code);
      expect(action.status).toBe('STRUCTURAL');
      expect(action.actionType).toBe('NONE');
      expect(action.route).toBeNull();
      expect(action.explanation).toMatch(/fonte canônica/i);
    }
  });

  it('is deterministic and closed: unknown codes are unsupported, never actionable', () => {
    const first = deriveMaintenanceAction('MISSING_PRICE');
    expect(deriveMaintenanceAction('MISSING_PRICE')).toEqual(first);
    const unknown = deriveMaintenanceAction('SOMETHING_NEW');
    expect(unknown.status).toBe('UNSUPPORTED');
    expect(unknown.actionType).toBe('NONE');
    expect(unknown.route).toBeNull();
  });
});
