import { DomainError } from '@atlas/domain';
import { MAX_TARGET_BP, MIN_TARGET_BP, STRATEGY_TOLERANCE_BP, STRATEGY_TOTAL_BP } from './policy';
import type {
  CategoryComparison,
  ComparisonState,
  CurrentWeightInput,
  StrategyComparison,
  StrategyTargetInput,
  StrategyValidationError,
} from './types';
import { STRATEGY_CATEGORY_ORDER } from './types';

/**
 * Phase 5Q-C — strategy validation + comparison (pure, zero I/O).
 *
 * The backend is the authority on the 100%-in-basis-points invariant;
 * validation fails closed on duplicates, unknown categories and totals.
 * Comparison is a neutral fact computation: deviation = current - target,
 * tolerance-gated states, canonical ordering. No recommendations.
 */

export function validateStrategyTargets(
  targets: readonly StrategyTargetInput[],
): { valid: true } | { valid: false; errors: StrategyValidationError[] } {
  const errors: StrategyValidationError[] = [];
  if (targets.length === 0) {
    return { valid: false, errors: [{ code: 'EMPTY_TARGETS' }] };
  }
  const seen = new Set<string>();
  let total = 0;
  for (const target of targets) {
    if (!STRATEGY_CATEGORY_ORDER.includes(target.category)) {
      errors.push({ code: 'UNKNOWN_CATEGORY' });
      continue;
    }
    if (seen.has(target.category)) {
      errors.push({ code: 'DUPLICATE_CATEGORY' });
      continue;
    }
    seen.add(target.category);
    if (
      !Number.isInteger(target.targetBp) ||
      target.targetBp < MIN_TARGET_BP ||
      target.targetBp > MAX_TARGET_BP
    ) {
      errors.push({ code: 'INVALID_WEIGHT' });
      continue;
    }
    total += target.targetBp;
  }
  if (total !== STRATEGY_TOTAL_BP) {
    errors.push({ code: 'TOTAL_NOT_100' });
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

function stateFor(deviationBp: number | null, toleranceBp: number): ComparisonState {
  if (deviationBp === null) return 'UNAVAILABLE';
  if (Math.abs(deviationBp) <= toleranceBp) return 'ON_TARGET';
  return deviationBp > 0 ? 'ABOVE_TARGET' : 'BELOW_TARGET';
}

/**
 * Compares user targets against current weights. The union of target and
 * current categories is compared: a targeted category with no current
 * weight reads 0 (explicit, STEP 28); a current category with no target
 * reads target 0 (explicit, STEP 29). Deterministic canonical ordering —
 * never sorted by current weight (STEP 69).
 */
export function compareAllocationToStrategy(input: {
  targets: readonly StrategyTargetInput[];
  current: readonly CurrentWeightInput[];
  toleranceBp?: number;
}): StrategyComparison {
  const tolerance = input.toleranceBp ?? STRATEGY_TOLERANCE_BP;
  const targetByCategory = new Map(
    input.targets.map((target) => [target.category, target.targetBp]),
  );
  const currentByCategory = new Map(input.current.map((row) => [row.category, row.currentBp]));
  const categories = Array.from(
    new Set([...targetByCategory.keys(), ...currentByCategory.keys()]),
  ).sort(
    (left, right) => STRATEGY_CATEGORY_ORDER.indexOf(left) - STRATEGY_CATEGORY_ORDER.indexOf(right),
  );

  const rows: CategoryComparison[] = categories.map((category) => {
    const targetBp = targetByCategory.get(category) ?? 0;
    const currentBp = currentByCategory.has(category)
      ? (currentByCategory.get(category) as number | null)
      : 0;
    const deviationBp = currentBp === null ? null : currentBp - targetBp;
    return {
      category,
      targetBp,
      currentBp,
      deviationBp,
      state: stateFor(deviationBp, tolerance),
    };
  });

  const outside = rows.filter(
    (row) => row.state === 'ABOVE_TARGET' || row.state === 'BELOW_TARGET',
  );
  const below = outside.filter((row) => row.deviationBp !== null && row.deviationBp < 0);
  const worst =
    below.length > 0
      ? below.reduce((a, b) => ((a.deviationBp as number) < (b.deviationBp as number) ? a : b))
      : null;

  return {
    rows,
    outsideTolerance: outside.map((row) => row.category),
    worstGap: worst ? { category: worst.category, deviationBp: worst.deviationBp as number } : null,
  };
}

export class InvalidAllocationStrategyError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_STRATEGY');
    this.name = 'InvalidAllocationStrategyError';
  }
}
