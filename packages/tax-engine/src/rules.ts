import type { LocalDate } from '@atlas/domain';
import type { TaxRuleResolution, TaxRuleSet } from './types';

/**
 * Validates a rule-set registry. Overlapping effective periods for the same
 * jurisdiction are invalid configuration (ADR-237) and must fail closed.
 */
export function validateTaxRuleSetRegistry(ruleSets: readonly TaxRuleSet[]): {
  readonly valid: boolean;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const rule of ruleSets) {
    if (seenIds.has(rule.id)) {
      errors.push(`Duplicate tax rule set id '${rule.id}'`);
    }
    seenIds.add(rule.id);

    if (rule.jurisdiction.trim().length === 0) {
      errors.push(`Tax rule set '${rule.id}' has an empty jurisdiction`);
    }

    if (rule.effectiveTo && rule.effectiveFrom.compare(rule.effectiveTo) > 0) {
      errors.push(
        `Tax rule set '${rule.id}' has effectiveFrom > effectiveTo (${rule.effectiveFrom.toString()} > ${rule.effectiveTo.toString()})`,
      );
    }
  }

  for (let i = 0; i < ruleSets.length; i++) {
    for (let j = i + 1; j < ruleSets.length; j++) {
      const a = ruleSets[i]!;
      const b = ruleSets[j]!;
      if (a.jurisdiction !== b.jurisdiction) continue;
      if (periodsOverlap(a, b)) {
        errors.push(
          `Overlapping tax rule sets for jurisdiction '${a.jurisdiction}': '${a.id}' and '${b.id}'`,
        );
      }
    }
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

function periodsOverlap(a: TaxRuleSet, b: TaxRuleSet): boolean {
  // Open-ended (no effectiveTo) extends to infinity.
  const aEndsBeforeBStarts =
    a.effectiveTo !== undefined && a.effectiveTo.compare(b.effectiveFrom) < 0;
  const bEndsBeforeAStarts =
    b.effectiveTo !== undefined && b.effectiveTo.compare(a.effectiveFrom) < 0;
  return !aEndsBeforeBStarts && !bEndsBeforeAStarts;
}

function isEffectiveOn(rule: TaxRuleSet, date: LocalDate): boolean {
  if (rule.effectiveFrom.compare(date) > 0) return false;
  if (rule.effectiveTo && rule.effectiveTo.compare(date) < 0) return false;
  return true;
}

/**
 * Deterministic resolver of the rule set effective for a jurisdiction on a
 * given date. Fails closed on missing coverage and (config-invalid) overlap;
 * it never silently selects a nearest rule.
 */
export function resolveTaxRuleSet(
  ruleSets: readonly TaxRuleSet[],
  jurisdiction: string,
  date: LocalDate,
): TaxRuleResolution {
  const candidates = ruleSets.filter(
    (rule) => rule.jurisdiction === jurisdiction && isEffectiveOn(rule, date),
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      code: 'MISSING_RULE_SET',
      message: `No tax rule set effective for jurisdiction '${jurisdiction}' on ${date.toString()}`,
    };
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_RULE_SET',
      message: `Ambiguous tax rule resolution for jurisdiction '${jurisdiction}' on ${date.toString()}: ${candidates
        .map((c) => c.id)
        .join(', ')}`,
    };
  }

  return { ok: true, ruleSet: candidates[0]! };
}
