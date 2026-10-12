import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ITaxNotificationEventRepository, TaxNotificationEventRow } from '@atlas/database';
import { TAX_NOTIFICATION_EVENT_REPOSITORY } from '../../database/tokens';
import { GetTaxComplianceRemindersUseCase } from './get-tax-compliance-reminders.use-case';

export interface RecordTaxNotificationDeliveryInput {
  readonly taxSubjectId: string;
  readonly reminderKey: string;
  readonly sourceFingerprint: string;
  readonly channel: 'IN_APP' | 'MOBILE_IN_APP';
  readonly triggerAt: string;
}

export interface RecordTaxNotificationDeliveryResult {
  readonly outcome: 'DELIVERED' | 'IDEMPOTENT';
  readonly record: TaxNotificationEventRow;
}

/**
 * Records an in-app delivery surfacing event. Delivery is idempotent per
 * (reminderKey, channel, sourceFingerprint): retries return the canonical
 * event. A delivery claim against a stale fingerprint is rejected (404)
 * instead of inventing delivery success for superseded content.
 */
@Injectable()
export class RecordTaxNotificationDeliveryUseCase {
  constructor(
    @Inject(TAX_NOTIFICATION_EVENT_REPOSITORY)
    private readonly eventRepository: ITaxNotificationEventRepository,
    @Inject(GetTaxComplianceRemindersUseCase)
    private readonly remindersUseCase: GetTaxComplianceRemindersUseCase,
  ) {}

  async execute(
    input: RecordTaxNotificationDeliveryInput,
  ): Promise<RecordTaxNotificationDeliveryResult> {
    if (!input.reminderKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax reminder '${input.reminderKey}' was not found.`);
    }

    const current = await this.remindersUseCase.execute({
      taxSubjectId: input.taxSubjectId,
    });
    const live = current.reminders.find((r) => r.reminderKey === input.reminderKey);
    if (
      !live ||
      live.status === 'SUPERSEDED' ||
      live.sourceFingerprint !== input.sourceFingerprint ||
      live.triggerAt !== input.triggerAt
    ) {
      throw new NotFoundException(`Tax reminder '${input.reminderKey}' was not found.`);
    }

    const dedupKey = `${input.reminderKey}:${input.channel}:${input.sourceFingerprint}`;
    return this.eventRepository.create({
      taxSubjectId: input.taxSubjectId,
      reminderKey: input.reminderKey,
      sourceFingerprint: input.sourceFingerprint,
      channel: input.channel,
      triggerAt: input.triggerAt,
      deliveryStatus: 'DELIVERED',
      dedupKey,
    });
  }

  async listDeliveries(input: {
    taxSubjectId: string;
    reminderKey?: string;
  }): Promise<TaxNotificationEventRow[]> {
    if (input.reminderKey && !input.reminderKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax reminder '${input.reminderKey}' was not found.`);
    }
    return this.eventRepository.listBySubject(input);
  }
}
