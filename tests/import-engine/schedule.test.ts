import { describe, expect, it } from 'vitest';
import {
  attemptsExhausted,
  civilDateInTimezone,
  computeNextRunAt,
  computeRetryNotBefore,
  InvalidScheduleInputError,
  isTerminalJobStatus,
  MAX_JOB_ATTEMPTS,
  resolveDueSlot,
  STALE_RUNNING_LEASE_MS,
} from '@atlas/import-engine';

/**
 * Phase 5P-A — schedule planner contract (pure).
 *
 * Product-controlled cadences only, explicit timezones, injected clock.
 * No cron expressions, no host-timezone sniffing, no real timers.
 */
describe('Phase 5P-A: schedule planner', () => {
  const TZ = 'America/Sao_Paulo';
  const daily = { cadence: 'DAILY', hourLocal: 8, minuteLocal: 0, timezone: TZ };
  // 2026-06-15 is a Monday.
  const mondayNoon = new Date('2026-06-15T12:00:00Z');

  it('MANUAL_ONLY never fires', () => {
    expect(
      computeNextRunAt(
        { cadence: 'MANUAL_ONLY', hourLocal: null, minuteLocal: null, timezone: TZ },
        mondayNoon,
      ),
    ).toBeNull();
  });

  it('DAILY schedules the same-day slot when still ahead', () => {
    // 12:00Z = 09:00 in Sao Paulo; an 18:00 local run is still ahead today.
    const next = computeNextRunAt({ ...daily, hourLocal: 18 }, mondayNoon);
    expect(next).not.toBeNull();
    expect(civilDateInTimezone(next!, TZ)).toBe('2026-06-15');
    expect(next!.getTime()).toBeGreaterThan(mondayNoon.getTime());
  });

  it('DAILY rolls to the next day when the slot already passed', () => {
    // 12:00Z = 09:00 local; 08:00 already passed.
    const next = computeNextRunAt(daily, mondayNoon);
    expect(next).not.toBeNull();
    expect(civilDateInTimezone(next!, TZ)).toBe('2026-06-16');
  });

  it('WEEKDAYS skips Saturday and Sunday', () => {
    // Friday 2026-06-19 12:00Z = 09:00 local; 08:00 passed -> next weekday is Monday.
    const friday = new Date('2026-06-19T12:00:00Z');
    const next = computeNextRunAt({ ...daily, cadence: 'WEEKDAYS' }, friday);
    expect(next).not.toBeNull();
    expect(civilDateInTimezone(next!, TZ)).toBe('2026-06-22');
  });

  it('WEEKDAYS fires on a regular Tuesday', () => {
    // Monday 2026-06-15 12:00Z = 09:00 local; 08:00 passed -> Tuesday.
    const next = computeNextRunAt({ ...daily, cadence: 'WEEKDAYS' }, mondayNoon);
    expect(next).not.toBeNull();
    expect(civilDateInTimezone(next!, TZ)).toBe('2026-06-16');
  });

  it('rejects unknown cadences, bad times and unknown timezones fail-closed', () => {
    expect(() => computeNextRunAt({ ...daily, cadence: 'HOURLY' }, mondayNoon)).toThrow(
      InvalidScheduleInputError,
    );
    expect(() => computeNextRunAt({ ...daily, hourLocal: 24 }, mondayNoon)).toThrow(
      InvalidScheduleInputError,
    );
    expect(() => computeNextRunAt({ ...daily, minuteLocal: 60 }, mondayNoon)).toThrow(
      InvalidScheduleInputError,
    );
    expect(() => computeNextRunAt({ ...daily, timezone: 'Mars/Olympus' }, mondayNoon)).toThrow(
      InvalidScheduleInputError,
    );
  });

  it('resolveDueSlot returns null when nothing is due', () => {
    const future = new Date('2026-06-16T11:00:00Z');
    expect(resolveDueSlot(daily, future, mondayNoon)).toBeNull();
    expect(resolveDueSlot(daily, null, mondayNoon)).toBeNull();
  });

  it('resolveDueSlot coalesces missed windows into the latest slot only', () => {
    // Daily 08:00 local = 11:00Z. Offline for 3 days: nextRunAt is day 1.
    const stored = new Date('2026-06-16T11:00:00Z');
    const now = new Date('2026-06-19T12:00:00Z');
    const slot = resolveDueSlot(daily, stored, now);
    expect(slot).not.toBeNull();
    // Latest missed occurrence: 2026-06-19 08:00 local, not three jobs.
    expect(civilDateInTimezone(slot!, TZ)).toBe('2026-06-19');
    expect(slot!.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it('job policy: bounded attempts, deterministic backoff, stale lease', () => {
    expect(MAX_JOB_ATTEMPTS).toBe(3);
    expect(attemptsExhausted(1)).toBe(false);
    expect(attemptsExhausted(3)).toBe(true);
    expect(isTerminalJobStatus('SUCCEEDED')).toBe(true);
    expect(isTerminalJobStatus('FAILED')).toBe(true);
    expect(isTerminalJobStatus('CANCELLED')).toBe(true);
    expect(isTerminalJobStatus('PENDING')).toBe(false);
    expect(isTerminalJobStatus('RUNNING')).toBe(false);
    const failedAt = new Date('2026-06-15T12:00:00Z');
    expect(computeRetryNotBefore(failedAt, 1).getTime() - failedAt.getTime()).toBe(60 * 1000);
    expect(computeRetryNotBefore(failedAt, 2).getTime() - failedAt.getTime()).toBe(120 * 1000);
    expect(STALE_RUNNING_LEASE_MS).toBe(60 * 60 * 1000);
  });
});
