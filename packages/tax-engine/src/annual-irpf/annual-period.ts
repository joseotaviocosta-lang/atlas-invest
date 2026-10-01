import { LocalDate } from '@atlas/domain';
import { InvalidCalendarYearError, InvalidDeclarationExerciseError } from '../errors';

/**
 * Branded nominal type for an economic calendar year (ano-calendário).
 * Represents the year the taxable events occurred.
 */
export type CalendarYear = number & { readonly __brand: unique symbol };

/**
 * Branded nominal type for a declaration exercise year (exercício).
 * Represents the year the annual declaration is filed (typically calendarYear + 1).
 */
export type DeclarationExercise = number & { readonly __brand: unique symbol };

/** Check if value is a valid calendar year integer within [1900, 2100]. */
export function isValidCalendarYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2100;
}

/** Create a verified CalendarYear or throw InvalidCalendarYearError. */
export function createCalendarYear(value: number): CalendarYear {
  if (!isValidCalendarYear(value)) {
    throw new InvalidCalendarYearError(
      `Invalid calendar year: ${value}. Must be an integer between 1900 and 2100.`,
    );
  }
  return value as CalendarYear;
}

/** Parse a calendar year from unknown input or return null. */
export function parseCalendarYear(value: unknown): CalendarYear | null {
  if (typeof value === 'string') {
    const parsed = parseInt(value.trim(), 10);
    if (isValidCalendarYear(parsed) && String(parsed) === value.trim()) {
      return parsed as CalendarYear;
    }
    return null;
  }
  if (isValidCalendarYear(value)) {
    return value as CalendarYear;
  }
  return null;
}

/** Check if value is a valid declaration exercise integer within [1900, 2100]. */
export function isValidDeclarationExercise(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2100;
}

/** Create a verified DeclarationExercise or throw InvalidDeclarationExerciseError. */
export function createDeclarationExercise(value: number): DeclarationExercise {
  if (!isValidDeclarationExercise(value)) {
    throw new InvalidDeclarationExerciseError(
      `Invalid declaration exercise: ${value}. Must be an integer between 1900 and 2100.`,
    );
  }
  return value as DeclarationExercise;
}

/** Parse a declaration exercise from unknown input or return null. */
export function parseDeclarationExercise(value: unknown): DeclarationExercise | null {
  if (typeof value === 'string') {
    const parsed = parseInt(value.trim(), 10);
    if (isValidDeclarationExercise(parsed) && String(parsed) === value.trim()) {
      return parsed as DeclarationExercise;
    }
    return null;
  }
  if (isValidDeclarationExercise(value)) {
    return value as DeclarationExercise;
  }
  return null;
}

/**
 * Resolves the ordinary Brazilian declaration exercise year for a calendar year (Ano-calendário Y -> Exercício Y+1).
 * In ordinary Brazilian DIRPF filing context, Exercício = Ano-calendário + 1.
 */
export function resolveOrdinaryDeclarationExercise(
  calendarYear: CalendarYear | number,
): DeclarationExercise {
  const year = typeof calendarYear === 'number' ? calendarYear : (calendarYear as number);
  return createDeclarationExercise(year + 1);
}

/**
 * Alias for resolveOrdinaryDeclarationExercise for backward compatibility.
 */
export function resolveDeclarationExercise(
  calendarYear: CalendarYear | number,
): DeclarationExercise {
  return resolveOrdinaryDeclarationExercise(calendarYear);
}

/**
 * Canonical temporal representation of an annual tax period.
 * Timezone-immune and strictly typed.
 */
export interface AnnualTaxPeriod {
  readonly calendarYear: CalendarYear;
  readonly declarationExercise: DeclarationExercise;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly effectiveFrom: LocalDate;
  readonly effectiveTo: LocalDate;
}

/**
 * Creates an immutable, canonical AnnualTaxPeriod for a given calendar year.
 * An optional declaration exercise may be supplied; defaults to ordinary DIRPF (calendarYear + 1).
 */
export function createAnnualTaxPeriod(
  yearInput: number | CalendarYear,
  exerciseInput?: number | DeclarationExercise,
): AnnualTaxPeriod {
  const calendarYear =
    typeof yearInput === 'number' && !isValidCalendarYear(yearInput)
      ? createCalendarYear(yearInput)
      : (yearInput as CalendarYear);

  const declarationExercise =
    exerciseInput !== undefined
      ? typeof exerciseInput === 'number' && !isValidDeclarationExercise(exerciseInput)
        ? createDeclarationExercise(exerciseInput)
        : (exerciseInput as DeclarationExercise)
      : resolveOrdinaryDeclarationExercise(calendarYear);

  const startDate = LocalDate.fromParts(calendarYear, 1, 1);
  const endDate = LocalDate.fromParts(calendarYear, 12, 31);

  return Object.freeze({
    calendarYear,
    declarationExercise,
    startDate,
    endDate,
    effectiveFrom: startDate,
    effectiveTo: endDate,
  });
}
