import { DomainError } from '@atlas/domain';
import { validateScenarioInput, validateScenarioName } from './scenario';

export const PLAN_STATUSES = ['PLANNED', 'COMPLETED', 'CANCELLED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  PLANNED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class InvalidContributionPlanError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_PLAN');
    this.name = 'InvalidContributionPlanError';
  }
}

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export type PlanDateValidationCode = 'INVALID_DATE' | 'PAST_DATE';

export interface PlanDateValidationError {
  code: PlanDateValidationCode;
}

/**
 * Phase 5Q-F — planned-date validation (pure, date-only).
 *
 * Strict `YYYY-MM-DD` with real calendar checks; string comparison only
 * (lexicographic ISO ordering), never `Date` construction — the value
 * stays date-only end to end, immune to timezone shifts. `today` is
 * injected (`YYYY-MM-DD`) for determinism. Past dates are rejected only
 * when `allowPast` is false (creation); an existing plan naturally ages
 * past its date and must remain editable.
 */
export function validatePlanDate(
  raw: unknown,
  today: string,
  allowPast: boolean,
): { valid: true; date: string } | { valid: false; errors: PlanDateValidationError[] } {
  if (typeof raw !== 'string') {
    return { valid: false, errors: [{ code: 'INVALID_DATE' }] };
  }
  const trimmed = raw.trim();
  const match = ISO_DATE_REGEX.exec(trimmed);
  if (!match) {
    return { valid: false, errors: [{ code: 'INVALID_DATE' }] };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isSafeInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return { valid: false, errors: [{ code: 'INVALID_DATE' }] };
  }
  if (!allowPast && trimmed < today) {
    return { valid: false, errors: [{ code: 'PAST_DATE' }] };
  }
  return { valid: true, date: trimmed };
}

export interface PlanItemInput {
  category: string;
  /** Locale or canonical money string; parsed to canonical before engine checks. */
  amount: string;
}

export type PlanValidationCode =
  | 'EMPTY_NAME'
  | 'NAME_TOO_LONG'
  | 'NAME_HAS_MARKUP'
  | 'INVALID_DATE'
  | 'PAST_DATE'
  | 'UNKNOWN_SCENARIO_TYPE'
  | 'UNSUPPORTED_SCENARIO_TYPE'
  | 'EMPTY_CHANGES'
  | 'TOO_MANY_CHANGES'
  | 'UNKNOWN_CATEGORY'
  | 'DUPLICATE_CATEGORY'
  | 'INVALID_AMOUNT'
  | 'NON_POSITIVE_AMOUNT';

export interface PlanValidationError {
  code: PlanValidationCode;
}

/**
 * Validates a user-declared contribution plan. Name rules and item rules
 * reuse the 5Q-D/5Q-E engine (no second implementation); date rules are
 * plan-specific. Amounts must already be canonical decimals here — locale
 * parsing happens at the edges (DTO/use-case), never inside the engine.
 */
export function validatePlanInput(input: {
  name: unknown;
  plannedDate: unknown;
  items: readonly PlanItemInput[];
  today: string;
  allowPastDate: boolean;
}):
  | { valid: true; name: string; plannedDate: string }
  | { valid: false; errors: PlanValidationError[] } {
  const errors: PlanValidationError[] = [];
  const nameValidation = validateScenarioName(input.name);
  if (!nameValidation.valid) {
    for (const error of nameValidation.errors) errors.push(error);
  }
  const dateValidation = validatePlanDate(input.plannedDate, input.today, input.allowPastDate);
  if (!dateValidation.valid) {
    for (const error of dateValidation.errors) errors.push(error);
  }
  if (!Array.isArray(input.items)) {
    errors.push({ code: 'EMPTY_CHANGES' });
  } else {
    const changes = input.items.map((item) => ({
      category: typeof item?.category === 'string' ? item.category : '',
      amount: typeof item?.amount === 'string' ? item.amount : '',
    }));
    const itemsValidation = validateScenarioInput({ type: 'CONTRIBUTION', changes });
    if (!itemsValidation.valid) {
      for (const error of itemsValidation.errors) errors.push(error);
    }
  }
  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    name: (nameValidation as { valid: true; name: string }).name,
    plannedDate: (dateValidation as { valid: true; date: string }).date,
  };
}

/**
 * Status machine: PLANNED → COMPLETED | CANCELLED. Terminal states are
 * final (no reopen in v1); COMPLETED never implies ledger writes.
 */
export function canTransitionPlanStatus(from: string, to: string): boolean {
  if (!(PLAN_STATUSES as readonly string[]).includes(from)) return false;
  if (!(PLAN_STATUSES as readonly string[]).includes(to)) return false;
  return (PLAN_TRANSITIONS[from as PlanStatus] as readonly string[]).includes(to);
}

/**
 * Canonical local "today" is provided by the caller (`YYYY-MM-DD` wall
 * clock of the relevant side); comparison stays lexicographic.
 */
export function isPlanOverdue(plannedDate: string, today: string): boolean {
  return plannedDate < today;
}
