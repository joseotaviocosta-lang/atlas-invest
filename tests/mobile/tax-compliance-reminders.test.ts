import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  mapToTaxComplianceReminderListViewModel,
  buildTaxReminderActionPayload,
  buildTaxReminderDeliveryPayload,
  taxReminderSnoozeDateError,
  TAX_REMINDER_STALE_MESSAGE,
  TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING,
  type RawTaxComplianceReminder,
} from '@atlas/ui';

const COMPONENT = 'apps/mobile/src/components/fiscal/TaxComplianceRemindersCard.tsx';
const SCREEN = 'apps/mobile/app/(app)/(tabs)/tax.tsx';

function sampleReminder(
  overrides: Partial<RawTaxComplianceReminder> = {},
): RawTaxComplianceReminder {
  return {
    reminderKey: 'rem:2026-09:mob1',
    taxSubjectId: 'subj-1',
    obligationKey: 'obl:2026-09:6015',
    sourceFingerprint: 'a'.repeat(64),
    kind: 'DUE_TODAY',
    triggerAt: '2026-09-30',
    effectiveAt: '2026-09-30',
    status: 'DELIVERED',
    severity: 'WARNING',
    title: 'DARF de setembro vence hoje',
    message: 'Apoio: confira a apuração antes do vencimento.',
    actionTarget: null,
    deliveryChannels: ['MOBILE_IN_APP'],
    dedupKey: 'dedup-mob-1',
    sourceVersion: '4K.3',
    snoozedUntil: null,
    actedAt: null,
    isStale: false,
    ...overrides,
  };
}

describe('Mobile Fiscal Compliance Reminders (Phase 4K.3)', () => {
  it('integrates TaxComplianceRemindersCard in the mobile Tax tab', () => {
    const screenContent = fs.readFileSync(path.join(process.cwd(), SCREEN), 'utf8');
    expect(screenContent).toContain('TaxComplianceRemindersCard');
  });

  it('maps upcoming/overdue/stale groups from mocked reminders', () => {
    const vms = mapToTaxComplianceReminderListViewModel([
      sampleReminder(),
      sampleReminder({ reminderKey: 'rem:2026-08:m2', kind: 'OVERDUE', title: 'DARF em atraso' }),
      sampleReminder({
        reminderKey: 'rem:2026-08:m3',
        kind: 'STALE_SOURCE',
        status: 'SUPERSEDED',
        isStale: true,
        title: 'Apuração recalculada',
      }),
      sampleReminder({
        reminderKey: 'rem:2026-08:m4',
        kind: 'ANNUAL_REVIEW_REQUIRED',
        title: 'Revisar informe anual',
      }),
    ]);
    const byKey = new Map(vms.map((v) => [v.reminderKey, v]));
    expect(byKey.get('rem:2026-09:mob1')?.group).toBe('upcoming');
    expect(byKey.get('rem:2026-08:m2')?.group).toBe('overdue');
    expect(byKey.get('rem:2026-08:m3')?.group).toBe('stale');
    expect(byKey.get('rem:2026-08:m4')?.group).toBe('action');
    expect(byKey.get('rem:2026-09:mob1')?.triggerAtFormatted).toBe('30/09/2026');
    expect(byKey.get('rem:2026-09:mob1')?.title).toBe('DARF de setembro vence hoje');
  });

  it('calls the action API with the exact payload shape', () => {
    expect(buildTaxReminderActionPayload(sampleReminder(), 'ACKNOWLEDGE')).toEqual({
      actionType: 'ACKNOWLEDGE',
      obligationKey: 'obl:2026-09:6015',
      reminderKind: 'DUE_TODAY',
      triggerAt: '2026-09-30',
      sourceFingerprint: 'a'.repeat(64),
    });
    expect(buildTaxReminderActionPayload(sampleReminder(), 'DISMISS')).toEqual({
      actionType: 'DISMISS',
      obligationKey: 'obl:2026-09:6015',
      reminderKind: 'DUE_TODAY',
      triggerAt: '2026-09-30',
      sourceFingerprint: 'a'.repeat(64),
    });
    expect(buildTaxReminderDeliveryPayload(sampleReminder(), 'MOBILE_IN_APP')).toEqual({
      sourceFingerprint: 'a'.repeat(64),
      channel: 'MOBILE_IN_APP',
      triggerAt: '2026-09-30',
    });
  });

  it('requires a valid snooze date and rejects invalid civil dates', () => {
    expect(() => buildTaxReminderActionPayload(sampleReminder(), 'SNOOZE')).toThrow(/nova data/i);
    expect(taxReminderSnoozeDateError('')).not.toBeNull();
    expect(taxReminderSnoozeDateError('30/09/2026')).toContain('AAAA-MM-DD');
    expect(taxReminderSnoozeDateError('2026-02-30')).toContain('civil válida');
    expect(taxReminderSnoozeDateError('2026-10-20')).toBeNull();
  });

  it('consumes canonical reminder endpoints with encoded keys and shared view-model', () => {
    const compContent = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(compContent).toContain('/api/v1/fiscal/compliance/reminders?calendarYear=');
    expect(compContent).toContain('/api/v1/fiscal/compliance/reminder-preferences');
    expect(compContent).toContain('/deliveries');
    expect(compContent).toContain('encodeURIComponent');
    expect(compContent).toContain('MOBILE_IN_APP');
    expect(compContent).toContain('mapToTaxComplianceReminderListViewModel');
    expect(compContent).toContain('taxComplianceRemindersQueryKey');
    expect(compContent).toContain('taxReminderPreferencesQueryKey');
    expect(compContent).toContain('buildTaxReminderActionPayload');
  });

  it('renders list, actions, snooze with validation, preferences, history and disclaimer', () => {
    const compContent = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(compContent).toContain('Lembretes fiscais');
    expect(compContent).toContain('Vencidos');
    expect(compContent).toContain('Reconhecer');
    expect(compContent).toContain('Dispensar');
    expect(compContent).toContain('Confirmar adiamento');
    expect(compContent).toContain('AAAA-MM-DD');
    expect(compContent).toContain('Preferências de lembretes');
    expect(compContent).toContain('Entregas');
    expect(compContent).toContain('Registrar entrega');
    expect(compContent).toContain('TAX_REMINDER_SUPPORT_DISCLAIMER');
    expect(compContent).toContain('TAX_REMINDER_STALE_MESSAGE');
    expect(compContent).toContain('TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING');
    expect(compContent).toContain('Tentar novamente');
    // Accessibility: touch targets and labels
    expect(compContent).toContain('minHeight: 44');
    expect(compContent).toContain('accessibilityLabel');
  });

  it('warns that dismiss does not resolve the obligation and shows the stale message', () => {
    expect(TAX_REMINDER_ACTION_NOT_RESOLVED_WARNING).toMatch(/não resolve a obrigação fiscal/i);
    expect(TAX_REMINDER_STALE_MESSAGE).toContain(
      'Os dados desta obrigação foram alterados. Revise novamente antes de considerar o item resolvido.',
    );
  });

  it('performs no client financial math and never renders derived totals', () => {
    const compContent = fs.readFileSync(path.join(process.cwd(), COMPONENT), 'utf8');
    expect(compContent).not.toMatch(/parseFloat/);
    expect(compContent).not.toMatch(/Math\./);
    expect(compContent).not.toMatch(/computeTax|calculateTax|calculateDue/i);
    expect(compContent).not.toMatch(/Total movimentado|Fluxo líquido|Rentabilidade do período/);
  });
});
