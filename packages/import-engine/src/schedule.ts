/**
 * Phase 5P-A — scheduled sync intent (pure, zero I/O).
 *
 * A schedule declares *what to sync, on which cadence, in which timezone*.
 * It knows nothing about dedupe, tax, Transaction construction or any
 * provider payload. Product-controlled cadences only: no free-form cron
 * reaches the user, so no absurd sub-hourly frequency can be expressed.
 *
 * WEEKDAYS means Monday–Friday. It deliberately does NOT claim B3 trading-
 * calendar equivalence (no holiday calendar in this phase).
 */

import { DomainError } from '@atlas/domain';

export const INTEGRATION_SCHEDULE_CADENCES = ['MANUAL_ONLY', 'DAILY', 'WEEKDAYS'] as const;
export type IntegrationScheduleCadence = (typeof INTEGRATION_SCHEDULE_CADENCES)[number];

export const INTEGRATION_SCHEDULE_DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export interface ScheduleCadenceInput {
  cadence: string;
  hourLocal?: number | null;
  minuteLocal?: number | null;
  timezone?: string | null;
}

export class InvalidScheduleInputError extends DomainError {
  constructor(message: string) {
    super(message, 'IMPORT.INVALID_SCHEDULE');
    this.name = 'InvalidScheduleInputError';
  }
}

function assertValidTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new InvalidScheduleInputError(`Timezone "${timezone}" desconhecido`);
  }
}

/**
 * Fail-closed cadence validation. DAILY/WEEKDAYS require an explicit local
 * time; MANUAL_ONLY never fires. Unknown cadences are rejected — never
 * silently coerced.
 */
export function assertValidScheduleInput(input: ScheduleCadenceInput): void {
  if (!INTEGRATION_SCHEDULE_CADENCES.includes(input.cadence as IntegrationScheduleCadence)) {
    throw new InvalidScheduleInputError(`Cadência "${input.cadence}" não suportada`);
  }
  if (input.cadence === 'MANUAL_ONLY') return;
  const timezone = input.timezone ?? INTEGRATION_SCHEDULE_DEFAULT_TIMEZONE;
  assertValidTimeZone(timezone);
  if (
    input.hourLocal === null ||
    input.hourLocal === undefined ||
    !Number.isInteger(input.hourLocal) ||
    input.hourLocal < 0 ||
    input.hourLocal > 23
  ) {
    throw new InvalidScheduleInputError('Cadência agendada exige hora local (0–23)');
  }
  if (
    input.minuteLocal === null ||
    input.minuteLocal === undefined ||
    !Number.isInteger(input.minuteLocal) ||
    input.minuteLocal < 0 ||
    input.minuteLocal > 59
  ) {
    throw new InvalidScheduleInputError('Cadência agendada exige minuto local (0–59)');
  }
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedWallParts(instant: Date, timezone: string): WallParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    if (!part) throw new InvalidScheduleInputError(`Timezone "${timezone}" não produziu ${type}`);
    return Number(part.value);
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * Converts a civil wall time in a named timezone to an absolute instant.
 * Iterative offset resolution (no date library, no host-timezone sniffing).
 * DST gaps resolve to the nearest valid instant; callers re-check strictness.
 */
function wallToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Naive target: the wanted wall reading reinterpreted as a UTC number.
  // Each step shifts the guess by (target - reading): the fixed point is
  // exactly the instant whose wall reading equals the target.
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const reading = zonedWallParts(new Date(guess), timezone);
    const readingAsUtc = Date.UTC(
      reading.year,
      reading.month - 1,
      reading.day,
      reading.hour,
      reading.minute,
      0,
      0,
    );
    const correction = targetAsUtc - readingAsUtc;
    if (correction === 0) break;
    guess += correction;
  }
  return new Date(guess);
}

function weekdayOfCivilDate(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function advanceOneDay(parts: WallParts): WallParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
  };
}

/**
 * Next scheduled occurrence strictly after `from`. Pure: the clock is an
 * explicit argument, so tests use a fake instant and never the real clock.
 * MANUAL_ONLY never fires (null).
 */
export function computeNextRunAt(
  input: Required<Omit<ScheduleCadenceInput, 'cadence'>> & { cadence: string },
  from: Date,
): Date | null {
  if (input.cadence === 'MANUAL_ONLY') return null;
  assertValidScheduleInput(input);
  const timezone = input.timezone ?? INTEGRATION_SCHEDULE_DEFAULT_TIMEZONE;
  const fromWall = zonedWallParts(from, timezone);

  let candidate: WallParts = {
    year: fromWall.year,
    month: fromWall.month,
    day: fromWall.day,
    hour: input.hourLocal as number,
    minute: input.minuteLocal as number,
  };
  const atOrBeforeFromWall =
    candidate.hour < fromWall.hour ||
    (candidate.hour === fromWall.hour && candidate.minute <= fromWall.minute);
  if (atOrBeforeFromWall) {
    candidate = advanceOneDay(candidate);
  }
  if (input.cadence === 'WEEKDAYS') {
    for (let guard = 0; guard < 8; guard += 1) {
      const weekday = weekdayOfCivilDate(candidate.year, candidate.month, candidate.day);
      if (weekday >= 1 && weekday <= 5) break;
      candidate = advanceOneDay(candidate);
    }
  }
  let instant = wallToInstant(
    candidate.year,
    candidate.month,
    candidate.day,
    candidate.hour,
    candidate.minute,
    timezone,
  );
  if (instant.getTime() <= from.getTime()) {
    const rolled = advanceOneDay(candidate);
    instant = wallToInstant(
      rolled.year,
      rolled.month,
      rolled.day,
      rolled.hour,
      rolled.minute,
      timezone,
    );
  }
  return instant;
}

/**
 * Civil date (YYYY-MM-DD) of an instant in a named timezone. Economic dates
 * travel as civil strings, never as host-timezone-shifted Dates.
 */
export function civilDateInTimezone(instant: Date, timezone: string): string {
  const parts = zonedWallParts(instant, timezone);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

/**
 * Missed-schedule coalescing (pure). When the service was offline, the tick
 * must enqueue the LATEST missed occurrence once — never one job per missed
 * slot (no storm). Walks forward from the stored nextRunAt while the
 * following occurrence is still in the past.
 */
export function resolveDueSlot(
  input: Required<Omit<ScheduleCadenceInput, 'cadence'>> & { cadence: string },
  nextRunAt: Date | null,
  now: Date,
): Date | null {
  if (!nextRunAt || nextRunAt.getTime() > now.getTime()) return null;
  let slot = nextRunAt;
  for (let guard = 0; guard < 366 * 2; guard += 1) {
    const following = computeNextRunAt(input, slot);
    if (!following || following.getTime() > now.getTime()) break;
    slot = following;
  }
  return slot;
}
