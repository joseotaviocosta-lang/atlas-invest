import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ITaxReminderActionRepository, TaxReminderActionRow } from '@atlas/database';
import { TAX_REMINDER_ACTION_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxComplianceRemindersUseCase } from './get-tax-compliance-reminders.use-case';

export interface RecordTaxReminderActionInput {
  readonly taxSubjectId: string;
  readonly reminderKey: string;
  readonly actionType: 'ACKNOWLEDGE' | 'SNOOZE' | 'DISMISS';
  readonly obligationKey: string;
  readonly reminderKind: string;
  readonly triggerAt: string;
  readonly sourceFingerprint: string;
  readonly snoozedUntil?: string;
  readonly note?: string;
}

export interface RecordTaxReminderActionResult {
  readonly outcome: 'CREATED' | 'IDEMPOTENT' | 'SUPERSEDED';
  readonly record: TaxReminderActionRow;
}

function parseCivilDateOrNull(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const millis = Date.UTC(year, month - 1, day);
  const check = new Date(millis);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return millis;
}

@Injectable()
export class RecordTaxReminderActionUseCase {
  constructor(
    @Inject(TAX_REMINDER_ACTION_REPOSITORY)
    private readonly reminderActionRepository: ITaxReminderActionRepository,
    @Inject(GetTaxComplianceRemindersUseCase)
    private readonly remindersUseCase: GetTaxComplianceRemindersUseCase,
    @Inject(FISCAL_CLOCK)
    private readonly clock: FiscalClock,
  ) {}

  async execute(input: RecordTaxReminderActionInput): Promise<RecordTaxReminderActionResult> {
    // 1. Anti-enumeration: reminderKey must belong to the authenticated subject.
    if (!input.reminderKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax reminder '${input.reminderKey}' was not found.`);
    }
    // 2. Structural binding: key must be ${obligationKey}:${kind}:${triggerAt}.
    const expectedKey = `${input.obligationKey}:${input.reminderKind}:${input.triggerAt}`;
    if (input.reminderKey !== expectedKey) {
      throw new BadRequestException(
        'reminderKey must equal ${obligationKey}:${reminderKind}:${triggerAt}.',
      );
    }
    if (!input.obligationKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax reminder '${input.reminderKey}' was not found.`);
    }
    if (parseCivilDateOrNull(input.triggerAt) === null) {
      throw new BadRequestException('triggerAt must be a valid civil date (YYYY-MM-DD).');
    }

    // 3. Snooze bounds: future civil date, at most 365 days ahead. Past or
    // extreme values fail validation; snooze never touches fiscal state.
    let snoozedUntil: string | undefined;
    if (input.actionType === 'SNOOZE') {
      if (!input.snoozedUntil) {
        throw new BadRequestException('snoozedUntil is required for SNOOZE actions.');
      }
      const today = this.clock.today();
      const snoozeMillis = parseCivilDateOrNull(input.snoozedUntil);
      const todayMillis = parseCivilDateOrNull(today);
      if (snoozeMillis === null || todayMillis === null || snoozeMillis <= todayMillis) {
        throw new BadRequestException('snoozedUntil must be a future civil date.');
      }
      if (snoozeMillis - todayMillis > 365 * 86_400_000) {
        throw new BadRequestException('snoozedUntil must be within 365 days.');
      }
      snoozedUntil = input.snoozedUntil;
    }

    // 4. The reminder instance must currently exist in the derived projection
    // (fail-closed against forged keys for obligations that never projected it).
    const current = await this.remindersUseCase.execute({
      taxSubjectId: input.taxSubjectId,
    });
    const live = current.reminders.find((r) => r.reminderKey === input.reminderKey);
    if (!live || live.status === 'SUPERSEDED') {
      throw new NotFoundException(`Tax reminder '${input.reminderKey}' was not found.`);
    }

    // 5. Append-only record. A stale sourceFingerprint is preserved as history;
    // the projection ignores it for the new source (never suppresses).
    const today = this.clock.today();
    const result = await this.reminderActionRepository.create({
      taxSubjectId: input.taxSubjectId,
      reminderKey: input.reminderKey,
      obligationKey: input.obligationKey,
      reminderKind: input.reminderKind,
      triggerAt: input.triggerAt,
      sourceFingerprint: input.sourceFingerprint,
      actionType: input.actionType,
      snoozedUntil: snoozedUntil ?? null,
      occurredAt: `${today}T00:00:00.000Z`,
    });
    return result;
  }
}
